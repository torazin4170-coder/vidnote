import type { NextConfig } from "next";
import path from "node:path";

const projectRoot = path.resolve(__dirname);

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
  outputFileTracingRoot: projectRoot,
  // 同一 LAN 内の別端末から dev サーバーへアクセスするときに必要
  allowedDevOrigins: ["192.168.2.102", "localhost"],
};

export default nextConfig;
