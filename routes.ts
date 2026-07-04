import { type RouteConfig, index, layout, route, prefix } from "@react-router/dev/routes";

const devRoutes = import.meta.env.DEV ? prefix("dev", [route("components", "dev/components.tsx")]) : [];

export default [
  route("api/generate", "routes/api.generate.ts"),
  layout("components/syncori-layout/syncori-layout.tsx", [
    index("routes/home.tsx"),
    route("photo", "routes/photo-studio.tsx"),
    route("video", "routes/video-studio.tsx"),
    route("audio", "routes/audio-studio.tsx"),
    route("music", "routes/music-studio.tsx"),
    route("ai", "routes/ai-studio.tsx"),
    route("assets", "routes/assets.tsx"),
    route("live", "routes/live-broadcast.tsx"),
    route("export", "routes/export.tsx"),
    route("settings", "routes/settings.tsx"),
  ]),
  ...devRoutes,
] satisfies RouteConfig;
