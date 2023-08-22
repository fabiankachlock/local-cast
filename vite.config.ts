import { Plugin, ResolvedConfig, UserConfig, defineConfig } from "vite";
import { resolve, join, basename, dirname } from "node:path";
import { promises as fs } from "node:fs";
import history from "connect-history-api-fallback";
import ejs from "ejs";
import basicSsl from "@vitejs/plugin-basic-ssl";

function EjsPlugin(data: Record<string, any> = {}): Plugin {
  let config: ResolvedConfig;

  return {
    name: "vite-plugin-ejs",

    // Get Resolved config
    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },

    transformIndexHtml: {
      enforce: "pre",
      async transform(html, ctx) {
        const siteData = data[basename(ctx.filename)];

        html = await ejs.render(
          html,
          {
            NODE_ENV: config.mode,
            isDev: config.mode === "development",
            ...(siteData ?? {}),
          },
          {
            views: ["./pages"],
            async: false,
          }
        );

        return html;
      },
    },
  };
}

async function* walk(
  dir: string,
  recursive: boolean
): AsyncGenerator<string, void, void> {
  for await (const d of await fs.opendir(dir)) {
    const entry = join(dir, d.name);
    if (d.isDirectory() && recursive) yield* walk(entry, true);
    else if (d.isFile()) yield entry;
  }
  return;
}

function MPAPlugin(dir: string): Plugin {
  let files: Record<string, string> = {};
  let localFiles: string[] = [];
  let config: ResolvedConfig;

  return {
    name: "vite-plugin-mpa",
    enforce: "pre",
    async config(config) {
      config.build = config.build || {};
      config.build.rollupOptions = config.build.rollupOptions || {};

      files = {};
      localFiles = [];
      for await (const p of walk(`./${dir}/`, false)) {
        files[basename(p, ".html")] = resolve(__dirname, p);
        localFiles.push(p);
      }

      config.build.rollupOptions.input = {
        ...files,
      };
    },
    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },
    configureServer({ middlewares: app }) {
      app.use(
        history({
          verbose: Boolean(process.env.DEBUG) && process.env.DEBUG !== "false",
          disableDotRule: undefined,
          htmlAcceptHeaders: ["text/html", "application/xhtml+xml"],
          rewrites: [
            {
              from: /^\/$/,
              to: `./${dir}/index.html`,
            },
            ...localFiles
              .sort((a, b) => {
                if (a.startsWith(b)) {
                  return -1;
                } else if (b.startsWith(a)) {
                  return 1;
                } else {
                  return b.length - a.length || a.localeCompare(b);
                }
              })
              .flatMap((pageName) => [
                {
                  from: basename(pageName),
                  to: "./" + pageName,
                },
                {
                  from: basename(pageName, ".html"),
                  to: "./" + pageName,
                },
              ]),
          ],
        })
      );
    },
    async closeBundle() {
      console.log(dir, config.build.outDir);
      for (const file of localFiles) {
        await fs.rename(
          `./${config.build.outDir}/${file}`,
          `./${config.build.outDir}/${file.substring(dir.length)}`
        );
      }
      await fs.rmdir(`./${config.build.outDir}/${dir}`);
    },
  };
}

export default defineConfig({
  server: {
    port: 4001,
    proxy: {
      "/api": "http://127.0.0.1:4000/",
    },
  },
  plugins: [
    basicSsl(),
    MPAPlugin("pages"),
    EjsPlugin({
      "send.html": {
        title: "LocalCast - Send",
        navbarBadge: "Sender",
      },
      "receive.html": {
        title: "LocalCast - Receive",
        navbarBadge: "Receiver",
      },
    }),
  ],
  build: {
    rollupOptions: {
      // input: {
      //     index: resolve(__dirname, './index.html'),
      //     send: resolve(__dirname, './send.html'),
      //     receive: resolve(__dirname, './receive.html')
      // }
    },
  },
});
