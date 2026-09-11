import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig, loadEnv } from "vite";
export default defineConfig(function (_a) {
    var mode = _a.mode;
    var env = loadEnv(mode, process.cwd(), "");
    var target = env.VITE_API_TARGET || process.env.VITE_API_TARGET || "http://127.0.0.1:8000";
    return {
        plugins: [react()],
        resolve: {
            alias: { "@": path.resolve(__dirname, "./src") },
        },
        server: {
            port: 5173,
            proxy: {
                // Proxy API + generated files to the FastAPI backend during dev.
                "/api": {
                    target: target,
                    changeOrigin: true,
                },
            },
        },
        build: {
            target: "es2020",
            rollupOptions: {
                output: {
                    manualChunks: {
                        "react-vendor": ["react", "react-dom", "react-router-dom"],
                        motion: ["framer-motion"],
                        charts: ["recharts"],
                    },
                },
            },
        },
    };
});
