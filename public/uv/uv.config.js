// uv.config.js - custom config that matches this app's vendored layout.
// Loaded in both page scope (via <script src="/uv/uv.config.js">) and
// service worker scope (via importScripts inside /uv/sw.js).

self.__uv$config = {
  prefix: '/uv/service/',
  encodeUrl: Ultraviolet.codec.xor.encode,
  decodeUrl: Ultraviolet.codec.xor.decode,
  handler: '/uv/uv.handler.js',
  client: '/uv/uv.client.js',
  bundle: '/uv/uv.bundle.js',
  config: '/uv/uv.config.js',
  sw: '/uv/uv.sw.js',
};