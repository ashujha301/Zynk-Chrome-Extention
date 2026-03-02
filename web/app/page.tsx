"use client";

import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
  useUser,
  useAuth,
} from "@clerk/nextjs";
import { useState, useEffect } from "react";

export default function Home() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // send the clerk token to the backend once to establish the httpOnly cookie
  const syncToken = async () => {
    try {
      const token = await getToken();
      await fetch("http://localhost:8000/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token }),
      });
    } catch (err) {
      console.warn("Failed to sync token", err);
    }
  };

  // wrapper that automatically retries once after refreshing the cookie
  const apiFetch = async (input: RequestInfo, init: RequestInit = {}) => {
    let resp = await fetch(input, { credentials: "include", ...init });
    if (resp.status === 401) {
      // access token probably expired; refresh and retry once
      await syncToken();
      resp = await fetch(input, { credentials: "include", ...init });
    }
    return resp;
  };

  // periodically refresh the cookie every 4 minutes so it doesn't expire
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (user) {
      interval = setInterval(syncToken, 4 * 60 * 1000); // 4 minutes
    }
    return () => clearInterval(interval);
  }, [user]);

  const callBackend = async () => {
    try {
      setLoading(true);
      const res = await apiFetch("http://localhost:8000/user/me");

      const data = await res.json();
      setResponse(JSON.stringify(data, null, 2));
    } catch (err) {
      setResponse("Error connecting to backend.");
    } finally {
      setLoading(false);
    }
  };

  // new helper for agent execute
  const [command, setCommand] = useState("");
  const callAgentExecute = async () => {
    try {
      setLoading(true);
      const res = await apiFetch("http://localhost:8000/agent/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
      });

      const data = await res.json();
      setResponse(JSON.stringify(data, null, 2));
    } catch (err) {
      setResponse("Error connecting to agent execute.");
    } finally {
      setLoading(false);
    }
  };

  // sync whenever the user becomes available
  useEffect(() => {
    if (user) {
      syncToken();
    } else {
      // when the user signs out, clear the server cookie
      fetch("http://localhost:8000/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    }
  }, [user]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-black relative overflow-hidden">

      {/* Background Glow Effects */}
      <div className="absolute w-[600px] h-[600px] bg-purple-600/30 blur-[150px] rounded-full top-[-200px] left-[-200px]" />
      <div className="absolute w-[500px] h-[500px] bg-cyan-500/20 blur-[150px] rounded-full bottom-[-200px] right-[-200px]" />

      <div className="relative backdrop-blur-xl bg-white/5 border border-white/10 shadow-2xl rounded-3xl p-10 w-[420px] text-center text-white">

        <SignedOut>
          <h1 className="text-3xl font-bold mb-2 tracking-wider">
            ZYNK
          </h1>
          <p className="text-sm text-gray-400 mb-6">
            AI Browser Agent Console
          </p>

          <SignInButton mode="modal">
            <button className="w-full bg-gradient-to-r from-purple-600 to-cyan-500 py-3 rounded-xl font-semibold hover:scale-105 transition transform shadow-lg shadow-purple-500/30">
              Initialize Agent
            </button>
          </SignInButton>
        </SignedOut>

        <SignedIn>
          <div className="flex justify-between items-center mb-6">
            <div className="text-left">
              <h1 className="text-lg font-semibold text-cyan-400">
                Welcome {user?.firstName || "User"}
              </h1>
              <p className="text-xs text-gray-400">
                Agent Status: <span className="text-green-400">Online</span>
              </p>
            </div>
            <UserButton afterSignOutUrl="/" />
          </div>

          <button
            onClick={callBackend}
            disabled={loading}
            className="w-full bg-gradient-to-r from-purple-600 to-cyan-500 py-3 rounded-xl font-semibold hover:scale-105 transition transform shadow-lg shadow-cyan-500/30 disabled:opacity-50"
          >
            {loading ? "Processing..." : "Run Secure Backend Check"}
          </button>

          {/* agent execute area */}
          <div className="mt-4">
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="Enter command for agent"
              className="w-full p-2 rounded mb-2 text-white"
            />
            <button
              onClick={callAgentExecute}
              disabled={loading || !command}
              className="w-full bg-gradient-to-r from-green-600 to-yellow-500 py-2 rounded font-semibold hover:scale-105 transition transform shadow-lg shadow-green-500/30 disabled:opacity-50"
            >
              {loading ? "Processing..." : "Execute Agent Command"}
            </button>
          </div>

          {response && (
            <div className="mt-6 text-left">
              <p className="text-xs text-gray-400 mb-2">Response Payload:</p>
              <pre className="bg-black/60 border border-cyan-500/30 p-3 rounded-lg text-xs overflow-x-auto text-cyan-300">
                {response}
              </pre>
            </div>
          )}
        </SignedIn>

      </div>
    </div>
  );
}