import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// GitHub Pages 用の base。リポジトリ名に合わせる。
export default defineConfig({
    base: "/mlit-links-akiya/",
    plugins: [react()],
});
