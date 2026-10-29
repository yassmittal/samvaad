/**
 * Runs the API and the web app behind two Cloudflare quick tunnels, so a phone can open the
 * app over HTTPS: browsers only allow the microphone on secure origins (D-010).
 *
 *   bun run dev:phone        then open the printed https://….trycloudflare.com on the phone
 *
 * Quick tunnels get new random URLs every run, so this wires them into the env vars that
 * need them (ALLOWED_WEB_ORIGINS, NEXT_PUBLIC_API_BASE_URL) instead of editing .env files.
 * Needs `cloudflared` (brew install cloudflared).
 */

import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Subprocess, spawn } from 'bun';

const API_PORT = 4400;
const WEB_PORT = 3400;
const TUNNEL_URL_PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;
// Printed once the tunnel can actually take requests, about a second after the URL.
const TUNNEL_CONNECTED_LOG_TEXT = 'Registered tunnel connection';
// Logged when the connection to Cloudflare's edge drops; the URL answers 1033 until it's back.
const TUNNEL_RETRYING_LOG_TEXT = 'Retrying connection';
// cloudflared defaults to QUIC over UDP, which kept timing out on our network ("failed to dial
// to edge with quic: timeout") and dropped both tunnels every 20 to 40 s. HTTP/2 runs over TCP.
const TUNNEL_PROTOCOL = 'http2';
const TUNNEL_LOG_DIRECTORY = join(tmpdir(), 'samvaad-dev-phone');
const TUNNEL_START_TIMEOUT_MILLISECONDS = 30_000;
const REPOSITORY_ROOT = join(import.meta.dir, '..');

const childProcesses: Subprocess[] = [];
let isStopping = false;

function stopEverything(exitCode = 0): never {
  isStopping = true;
  for (const childProcess of childProcesses) {
    childProcess.kill();
  }
  process.exit(exitCode);
}
process.on('SIGINT', () => stopEverything());
process.on('SIGTERM', () => stopEverything());

/**
 * Starts a quick tunnel and resolves with its public URL once it is connected. Its full log
 * goes to a file; the terminal only hears about drops and reconnects.
 */
function startTunnel(tunnelName: string, localUrl: string): Promise<string> {
  const tunnelProcess = spawn(
    ['cloudflared', 'tunnel', '--no-autoupdate', '--protocol', TUNNEL_PROTOCOL, '--url', localUrl],
    {
      stdout: 'ignore',
      stderr: 'pipe',
    },
  );
  childProcesses.push(tunnelProcess);
  mkdirSync(TUNNEL_LOG_DIRECTORY, { recursive: true });
  const logFilePath = join(TUNNEL_LOG_DIRECTORY, `${tunnelName}-tunnel.log`);
  const logFileWriter = Bun.file(logFilePath).writer();

  return new Promise((resolve) => {
    const textDecoder = new TextDecoder();
    let startupLogText = '';
    let isConnected = false;
    let isReconnecting = false;
    const timeout = setTimeout(() => {
      console.error(`cloudflared did not connect ${localUrl} within 30 s:\n${startupLogText}`);
      stopEverything(1);
    }, TUNNEL_START_TIMEOUT_MILLISECONDS);

    function reportReconnection(logText: string): void {
      if (logText.includes(TUNNEL_RETRYING_LOG_TEXT) && !isReconnecting) {
        isReconnecting = true;
        console.log(
          `[${tunnelName} tunnel] lost Cloudflare, reconnecting (1033 errors meanwhile)…`,
        );
      }
      if (logText.includes(TUNNEL_CONNECTED_LOG_TEXT) && isReconnecting) {
        isReconnecting = false;
        console.log(`[${tunnelName} tunnel] reconnected. Reload the page on the phone.`);
      }
    }

    // Keep reading for the tunnel's whole life. If nothing drains the pipe, cloudflared is
    // killed by its next log line, and the URL answers with Cloudflare error 1033.
    void (async () => {
      for await (const chunk of tunnelProcess.stderr) {
        const logText = textDecoder.decode(chunk, { stream: true });
        logFileWriter.write(logText);
        logFileWriter.flush();
        if (isConnected) {
          reportReconnection(logText);
          continue;
        }
        startupLogText += logText;
        const tunnelUrl = startupLogText.match(TUNNEL_URL_PATTERN)?.[0];
        if (tunnelUrl && startupLogText.includes(TUNNEL_CONNECTED_LOG_TEXT)) {
          isConnected = true;
          clearTimeout(timeout);
          resolve(tunnelUrl);
        }
      }
    })();

    void tunnelProcess.exited.then((exitCode) => {
      if (isStopping) {
        return;
      }
      console.error(
        `cloudflared for ${localUrl} exited with code ${exitCode}. Stopping. Log: ${logFilePath}`,
      );
      stopEverything(1);
    });
  });
}

function startWorkspaceDevServer(workspaceDirectory: string, env: Record<string, string>): void {
  childProcesses.push(
    spawn(['bun', 'run', 'dev'], {
      cwd: join(REPOSITORY_ROOT, workspaceDirectory),
      // Variables already in the environment win over .env files, in both Bun and Next.js.
      env: { ...process.env, ...env },
      stdout: 'inherit',
      stderr: 'inherit',
    }),
  );
}

console.log('Starting Cloudflare quick tunnels…');
const [apiTunnelUrl, webTunnelUrl] = await Promise.all([
  startTunnel('api', `http://127.0.0.1:${API_PORT}`),
  startTunnel('web', `http://localhost:${WEB_PORT}`),
]);

startWorkspaceDevServer('apps/api', {
  ALLOWED_WEB_ORIGINS: `http://localhost:${WEB_PORT},${webTunnelUrl}`,
});
startWorkspaceDevServer('apps/web', { NEXT_PUBLIC_API_BASE_URL: apiTunnelUrl });

console.log(`
  API tunnel:  ${apiTunnelUrl}
  Web tunnel:  ${webTunnelUrl}

  Open this on the phone:  ${webTunnelUrl}/table
  (The first load compiles the page and can take a few seconds.)
  Tunnel logs: ${TUNNEL_LOG_DIRECTORY}
`);
