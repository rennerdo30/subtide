import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightThemeGalaxy from "starlight-theme-galaxy";

export default defineConfig({
  site: "https://rennerdo30.github.io",
  base: "/subtide",
  integrations: [
    starlight({
      title: "Subtide",
      description: "AI-powered video subtitle translation for YouTube, Twitch, and any video site",
      plugins: [starlightThemeGalaxy()],
      customCss: ["./src/styles/custom.css"],
      social: [
        { icon: "github", label: "GitHub", href: "https://github.com/rennerdo30/subtide" },
      ],
      sidebar: [
        { label: "Home", slug: "index" },
        {
          label: "Getting Started",
          items: [
            { label: "Quick Start", slug: "getting-started/quick-start" },
            { label: "Installation", slug: "getting-started/installation" },
            { label: "Configuration", slug: "getting-started/configuration" },
          ],
        },
        {
          label: "User Guide",
          items: [
            { label: "YouTube", slug: "user-guide/youtube" },
            { label: "YouTube Shorts", slug: "user-guide/youtube-shorts" },
            { label: "Twitch", slug: "user-guide/twitch" },
            { label: "Generic Sites", slug: "user-guide/generic-sites" },
            { label: "Keyboard Shortcuts", slug: "user-guide/keyboard-shortcuts" },
          ],
        },
        {
          label: "Backend",
          items: [
            { label: "Overview", slug: "backend/overview" },
            { label: "Docker Deployment", slug: "backend/docker" },
            { label: "RunPod Deployment", slug: "backend/runpod" },
            { label: "Local LLM Setup", slug: "backend/local-llm" },
          ],
        },
        {
          label: "API Reference",
          items: [
            { label: "Endpoints", slug: "api/endpoints" },
            { label: "Configuration", slug: "api/configuration" },
          ],
        },
        { label: "FAQ", slug: "faq" },
        { label: "Troubleshooting", slug: "troubleshooting" },
        { label: "Security", slug: "security" },
        { label: "Contributing", slug: "contributing" },
        { label: "Changelog", slug: "changelog" },
      ],
    }),
  ],
});
