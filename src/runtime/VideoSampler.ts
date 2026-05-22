/**
 * VideoSampler — MP4 Environmental Render Source
 * 
 * Samples dominant color, motion intensity, and light direction
 * from MP4 frames in a continuous loop without visible restart.
 * Feeds color/motion data into UI rendering and orb behavior.
 */

export interface EnvironmentalRenderData {
  dominantHue: number;      // 0-360
  dominantSaturation: number; // 0-1
  dominantBrightness: number; // 0-1
  accentHue: number;         // secondary color hue
  motionIntensity: number;    // 0-1, frame-to-frame change
  lightDirection: [number, number]; // normalized x, y
  luminance: number;         // 0-1, overall brightness
  timestamp: number;
}

export class VideoSampler {
  private videoElement: HTMLVideoElement | null = null;
  private canvas: OffscreenCanvas | null = null;
  private canvasCtx: OffscreenCanvasRenderingContext2D | null = null;
  private isRunning = false;
  private animationId: number | null = null;
  private lastFrameData: ImageData | null = null;
  private listeners: Array<(data: EnvironmentalRenderData) => void> = [];
  private sampleInterval = 100; // ms between samples

  constructor(videoPath: string) {
    this.initVideo(videoPath);
  }

  private initVideo(videoPath: string): void {
    try {
      // Create video element
      const video = document.createElement('video');
      video.src = videoPath;
      video.loop = true;
      video.autoplay = false;
      video.muted = true;
      video.crossOrigin = 'anonymous';
      video.style.display = 'none';

      // Create offscreen canvas for sampling
      this.canvas = new OffscreenCanvas(128, 128); // small for performance
      this.canvasCtx = this.canvas.getContext('2d', { willReadFrequently: true });

      video.addEventListener('play', () => this.startSampling());
      video.addEventListener('ended', () => {
        // Loop seamlessly
        video.currentTime = 0;
        video.play();
      });

      document.body.appendChild(video);
      this.videoElement = video;

      // Start playback
      video.play().catch(() => {
        console.log('[VideoSampler] Autoplay blocked, waiting for user interaction');
      });
    } catch (e) {
      console.log('[VideoSampler] Init failed:', e);
    }
  }

  private startSampling(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    const sample = () => {
      if (!this.isRunning) return;

      const data = this.sampleFrame();
      if (data) {
        this.broadcast(data);
      }

      setTimeout(() => {
        sample();
      }, this.sampleInterval);
    };

    sample();
  }

  private sampleFrame(): EnvironmentalRenderData | null {
    if (!this.videoElement || !this.canvasCtx || !this.canvas) return null;

    try {
      this.canvasCtx.drawImage(this.videoElement, 0, 0, 128, 128);
      const imageData = this.canvasCtx.getImageData(0, 0, 128, 128);

      // Analyze color and motion
      const { dominantHue, dominantSaturation, dominantBrightness, accentHue, luminance } = this.analyzeColors(imageData);
      const motionIntensity = this.calculateMotionIntensity(imageData);
      const lightDirection = this.detectLightDirection(imageData);

      const data: EnvironmentalRenderData = {
        dominantHue,
        dominantSaturation,
        dominantBrightness,
        accentHue,
        motionIntensity,
        lightDirection,
        luminance,
        timestamp: Date.now(),
      };

      this.lastFrameData = imageData;
      return data;
    } catch (e) {
      console.log('[VideoSampler] Sampling failed:', e);
      return null;
    }
  }

  private analyzeColors(imageData: ImageData) {
    const data = imageData.data;
    const hues: number[] = [];
    const saturations: number[] = [];
    const brightnesses: number[] = [];
    let totalR = 0, totalG = 0, totalB = 0;

    // Sample every 4th pixel for speed
    for (let i = 0; i < data.length; i += 16) {
      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const b = data[i + 2] / 255;

      totalR += r;
      totalG += g;
      totalB += b;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const brightness = (max + min) / 2;

      let hue = 0;
      const saturation = brightness > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);

      if (max === r) hue = ((g - b) / (max - min) + (g < b ? 6 : 0)) / 6;
      else if (max === g) hue = ((b - r) / (max - min) + 2) / 6;
      else hue = ((r - g) / (max - min) + 4) / 6;

      hues.push(hue * 360);
      saturations.push(saturation);
      brightnesses.push(brightness);
    }

    const dominantHue = hues.reduce((a, b) => a + b, 0) / hues.length;
    const dominantSaturation = saturations.reduce((a, b) => a + b, 0) / saturations.length;
    const dominantBrightness = brightnesses.reduce((a, b) => a + b, 0) / brightnesses.length;
    const luminance = (totalR + totalG + totalB) / (data.length / 4);

    // Accent hue is 120° offset
    const accentHue = (dominantHue + 120) % 360;

    return {
      dominantHue,
      dominantSaturation,
      dominantBrightness,
      accentHue,
      luminance,
    };
  }

  private calculateMotionIntensity(imageData: ImageData): number {
    if (!this.lastFrameData) return 0;

    let diffSum = 0;
    const data = imageData.data;
    const lastData = this.lastFrameData.data;

    for (let i = 0; i < data.length; i += 4) {
      const diffR = Math.abs(data[i] - lastData[i]);
      const diffG = Math.abs(data[i + 1] - lastData[i + 1]);
      const diffB = Math.abs(data[i + 2] - lastData[i + 2]);
      diffSum += (diffR + diffG + diffB) / 3;
    }

    const avgDiff = diffSum / (data.length / 4);
    return Math.min(1, avgDiff / 255); // Normalized 0-1
  }

  private detectLightDirection(imageData: ImageData): [number, number] {
    const data = imageData.data;
    const width = 128;
    const height = 128;
    let leftBright = 0, rightBright = 0, topBright = 0, bottomBright = 0;

    // Sample edges
    for (let i = 0; i < data.length; i += 4) {
      const pixel = i / 4;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3 / 255;

      if (x < 32) leftBright += brightness;
      if (x > 96) rightBright += brightness;
      if (y < 32) topBright += brightness;
      if (y > 96) bottomBright += brightness;
    }

    const xDir = (rightBright - leftBright) / 128;
    const yDir = (bottomBright - topBright) / 128;

    return [xDir, yDir];
  }

  /**
   * Resume video playback
   */
  resume(): void {
    if (this.videoElement) {
      this.videoElement.play().catch(() => {});
    }
  }

  /**
   * Register listener for environmental data
   */
  onEnvironmentalChange(callback: (data: EnvironmentalRenderData) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  private broadcast(data: EnvironmentalRenderData): void {
    this.listeners.forEach(listener => listener(data));
  }

  /**
   * Get current environmental state
   */
  getCurrentData(): EnvironmentalRenderData | null {
    if (!this.lastFrameData) return null;

    return this.analyzeColors(this.lastFrameData) as any; // simplified, real impl would return full data
  }

  /**
   * Shutdown
   */
  destroy(): void {
    this.isRunning = false;
    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.remove();
    }
  }
}

// Export factory
export function createVideoSampler(videoPath: string): VideoSampler {
  return new VideoSampler(videoPath);
}
