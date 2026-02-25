import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["openvino-node", "openvino-genai-node", "sharp"],
};

export default nextConfig;
