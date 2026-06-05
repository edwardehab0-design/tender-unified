const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = Number(process.env.PORT || 4177);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function readLocalEnv() {
  const envPath = path.join(root, ".env.local");
  try {
    const content = fs.readFileSync(envPath, "utf8");
    return content.split(/\r?\n/).reduce((env, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return env;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match) return env;

      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      env[match[1]] = value;
      return env;
    }, {});
  } catch {
    return {};
  }
}

function injectLocalConfig(data) {
  const localEnv = readLocalEnv();
  const supabaseUrl = process.env.SUPABASE_URL || localEnv.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || localEnv.SUPABASE_ANON_KEY;
  const authBypassValue = process.env.LOCAL_AUTH_BYPASS || localEnv.LOCAL_AUTH_BYPASS;
  const localAuthBypass = authBypassValue
    ? !["0", "false", "no", "off"].includes(authBypassValue.toLowerCase())
    : true;
  let source = data.toString("utf8");

  if (supabaseUrl) {
    source = source.replace('"__SUPABASE_URL__"', JSON.stringify(supabaseUrl));
  }
  if (supabaseAnonKey) {
    source = source.replace('"__SUPABASE_ANON_KEY__"', JSON.stringify(supabaseAnonKey));
  }
  source = source.replace(
    "localAuthBypass: false",
    `localAuthBypass: ${localAuthBypass}`
  );

  return Buffer.from(source, "utf8");
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith("/")) pathname += "index.html";

  const file = path.normalize(path.join(root, pathname));
  if (!file.startsWith(root)) {
    res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  fs.readFile(file, (error, data) => {
    if (error) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    if (path.basename(file) === "config.js" && path.dirname(file) === root) {
      data = injectLocalConfig(data);
    }
    res.writeHead(200, {
      "content-type": types[path.extname(file).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-store"
    });
    res.end(data);
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`http://127.0.0.1:${port}/`);
});
