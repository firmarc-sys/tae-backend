import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import express from "express";
import { GoogleGenAI } from "@google/genai";

export const THOTH_LIVE_MODEL = process.env.THOTH_TRANSCRIBE_LIVE_MODEL || "gemini-3.5-transcribe-live";
export const THOTH_RECORD_MODEL = process.env.THOTH_TRANSCRIBE_MODEL || "gemini-3.5-transcribe";

export const THOTH_SYSTEM_VOCABULARY = Object.freeze([
  "Jahorin", "Trismegistus", "Thoth", "Wepwawet", "Ma'at", "Hathor", "Horus", "Anubis", "Ptah", "Seshat", "Shu", "Bes", "Hapi", "Osiris", "Isis", "Hephaestus", "Mercury", "TAE", "GID", "S.I.aaS.", "Syncori", "Nova", "NovaLife", "NovaFin", "Vulgate", "Augment", "Interweb", "Spatial OS", "NSOS", "HEROS", "Galactic Pop", "My AI Home"
]);

function extensionFor(mime = "") {
  const value = String(mime).toLowerCase();
  if (value.includes("wav")) return ".wav";
  if (value.includes("mpeg") || value.includes("mp3")) return ".mp3";
  if (value.includes("mp4") || value.includes("m4a")) return ".m4a";
  if (value.includes("ogg")) return ".ogg";
  if (value.includes("webm")) return ".webm";
  if (value.includes("flac")) return ".flac";
  return ".audio";
}

function voiceError(status, code, message, details = null) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.details = details;
  return error;
}

function requireVoiceClient(apiKey) {
  if (!apiKey) throw voiceError(503, "THOTH_VOICE_NOT_CONFIGURED", "Thoth voice model intelligence is not configured on ARI.");
  return new GoogleGenAI({ apiKey });
}

export function thothVoiceReadiness(apiKey) {
  return {
    thoth_voice_configured: Boolean(apiKey),
    thoth_live_model: THOTH_LIVE_MODEL,
    thoth_record_model: THOTH_RECORD_MODEL,
    thoth_voice_primitive: "VOICE>THOTH>LANGUAGE>JAHORIN>INTENTION"
  };
}

export function installThothVoiceRoutes(app, { apiKey, authorize }) {
  app.post("/api/voice/token", async (req, res, next) => {
    try {
      await authorize(req);
      const client = requireVoiceClient(apiKey);
      const now = Date.now();
      const expireTime = new Date(now + 30 * 60 * 1000).toISOString();
      const newSessionExpireTime = new Date(now + 60 * 1000).toISOString();
      const token = await client.authTokens.create({
        config: {
          uses: 1,
          expireTime,
          newSessionExpireTime,
          liveConnectConstraints: {
            model: THOTH_LIVE_MODEL,
            config: {
              responseModalities: ["TEXT"],
              inputAudioTranscription: {
                languageCodes: [],
                customVocabulary: [...THOTH_SYSTEM_VOCABULARY],
                mode: "SMART"
              }
            }
          }
        }
      });
      if (!token?.name) throw voiceError(502, "THOTH_TOKEN_EMPTY", "Gemini did not return a live transcription token.");
      res.set("cache-control", "no-store");
      res.json({
        ok: true,
        intelligence: "THOTH",
        mode: "live",
        model: THOTH_LIVE_MODEL,
        token: token.name,
        expires_at: expireTime,
        new_session_expires_at: newSessionExpireTime,
        transcription: { language_codes: [], mode: "SMART", custom_vocabulary: THOTH_SYSTEM_VOCABULARY }
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/voice/transcribe", express.raw({ type: "audio/*", limit: "100mb" }), async (req, res, next) => {
    let tempPath = null;
    try {
      await authorize(req);
      const client = requireVoiceClient(apiKey);
      const mimeType = String(req.get("content-type") || "application/octet-stream").split(";")[0].trim().toLowerCase();
      if (!mimeType.startsWith("audio/")) throw voiceError(415, "THOTH_AUDIO_TYPE", "Thoth record requires an audio content type.");
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw voiceError(400, "THOTH_AUDIO_EMPTY", "No audio recording was supplied.");

      tempPath = path.join(os.tmpdir(), `thoth-${crypto.randomUUID()}${extensionFor(mimeType)}`);
      await fs.writeFile(tempPath, req.body);
      const audioFile = await client.files.upload({ file: tempPath, config: { mime_type: mimeType } });
      const diarization = /^(1|true|yes)$/i.test(String(req.query?.diarization || ""));
      const timestamps = /^(1|true|yes)$/i.test(String(req.query?.timestamps || ""));
      const mode = diarization || timestamps
        ? { type: "verbatim", ...(diarization ? { diarization_mode: "speaker" } : {}), ...(timestamps ? { timestamp_granularities: ["word"] } : {}) }
        : { type: "smart" };
      const interaction = await client.interactions.create({
        model: THOTH_RECORD_MODEL,
        input: [{ type: "audio", uri: audioFile.uri, mime_type: audioFile.mimeType || mimeType }],
        generation_config: {
          transcription_config: {
            language_codes: [],
            custom_vocabulary: [...THOTH_SYSTEM_VOCABULARY],
            mode
          }
        }
      });
      const transcript = String(interaction?.output_text || "").trim();
      if (!transcript) throw voiceError(502, "THOTH_TRANSCRIPT_EMPTY", "Gemini did not return a transcription.");
      res.set("cache-control", "no-store");
      res.json({ ok: true, intelligence: "THOTH", mode: "record", model: THOTH_RECORD_MODEL, transcript, diarization, timestamps });
    } catch (error) {
      next(error);
    } finally {
      if (tempPath) await fs.unlink(tempPath).catch(() => {});
    }
  });
}
