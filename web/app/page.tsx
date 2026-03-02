"use client";

import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
  useUser,
  useAuth,
} from "@clerk/nextjs";
import { useState } from "react";

export default function Home() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const callBackend = async () => {
    try {
      setLoading(true);
      const token = await getToken();

      const res = await fetch("http://localhost:8000/protected", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      setResponse(JSON.stringify(data, null, 2));
    } catch (err) {
      setResponse("Error connecting to backend.");
    } finally {
      setLoading(false);
    }
  };

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