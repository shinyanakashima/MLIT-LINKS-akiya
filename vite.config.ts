import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages 用の base。リポジトリ名(大文字小文字を含め)に正確に合わせる。
export default defineConfig({
  base: "/MLIT-LINKS-akiya/",
  plugins: [react()],
});
