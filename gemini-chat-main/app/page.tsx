"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  imageUrl?: string;
};

export default function Home() {
  const backendUrl =
    process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8000";

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function onPickImage(file: File | null) {
    if (!file) {
      setImageFile(null);
      setImagePreview("");
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function clearImage() {
    setImageFile(null);
    setImagePreview("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function sendMessage() {
    const prompt = input.trim();
    if (!prompt || loading) return;

    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "user",
        text: prompt,
        imageUrl: imagePreview || undefined,
      },
    ]);
    setInput("");
    setErrorText("");

    const form = new FormData();
    const history = messages
      .slice(-8)
      .map((message) => `${message.role === "user" ? "User" : "Assistant"}: ${message.text}`)
      .join("\n");

    let promptForModel = history ? `${history}\nUser: ${prompt}` : prompt;
    if (imageFile) {
      promptForModel += "\nUser attached an image to this message.";
    }

    form.set("prompt", promptForModel);
    if (imageFile) form.set("image", imageFile);

    clearImage();
    setLoading(true);

    try {
      const response = await fetch(`${backendUrl}/api/chat`, {
        method: "POST",
        body: form,
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Request failed.");
      }
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: String(payload.answer || "(No text returned)"),
        },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error.";
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", text: `Error: ${message}` },
      ]);
      setErrorText(message);
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendMessage();
  }

  async function onInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      await sendMessage();
    }
  }

  return (
    <main className="min-h-screen bg-black p-4 text-zinc-100 md:p-8">
      <section className="mx-auto flex h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950 shadow-[0_20px_60px_rgba(0,0,0,0.55)]">
        <header className="border-b border-zinc-800 px-5 py-4 md:px-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.17em] text-zinc-400">
            OpenVINO Vision Chat
          </p>
          <h1 className="mt-1 text-lg font-semibold text-zinc-100 md:text-xl">
            Conversation
          </h1>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-5 md:px-6">
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/70 p-6 text-center text-sm text-zinc-400">
              Start by typing a message. Add an image with the upload icon when needed.
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => {
                const isUser = message.role === "user";
                return (
                  <article
                    key={message.id}
                    className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 md:max-w-[75%] ${
                        isUser
                          ? "bg-white text-black"
                          : "border border-zinc-700 bg-zinc-900 text-zinc-100"
                      }`}
                    >
                      <p
                        className={`mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] ${
                          isUser ? "text-zinc-600" : "text-zinc-400"
                        }`}
                      >
                        {isUser ? "You" : "Assistant"}
                      </p>
                      {message.imageUrl ? (
                        <img
                          src={message.imageUrl}
                          alt="User upload"
                          className="mb-3 max-h-64 w-full rounded-xl object-contain"
                        />
                      ) : null}
                      <p className="whitespace-pre-wrap text-sm leading-7">{message.text}</p>
                    </div>
                  </article>
                );
              })}
              {loading ? (
                <article className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm italic text-zinc-400 md:max-w-[75%]">
                    Assistant is thinking...
                  </div>
                </article>
              ) : null}
              <div ref={endRef} />
            </div>
          )}
        </div>

        <form
          onSubmit={onSubmit}
          className="border-t border-zinc-800 bg-zinc-950 px-4 py-4 md:px-6"
        >
          {imagePreview ? (
            <div className="mb-3 flex items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-900 p-2">
              <img
                src={imagePreview}
                alt="Selected preview"
                className="h-14 w-14 rounded-lg object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-zinc-200">{imageFile?.name}</p>
                <button
                  type="button"
                  onClick={clearImage}
                  className="mt-1 text-xs text-zinc-400 hover:text-zinc-200"
                >
                  Remove image
                </button>
              </div>
            </div>
          ) : null}

          <div className="flex items-end gap-2 md:gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(event) => onPickImage(event.target.files?.[0] ?? null)}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              aria-label="Upload image"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M12 16V8M12 8L9 11M12 8L15 11M21 15V18C21 19.1 20.1 20 19 20H5C3.9 20 3 19.1 3 18V15M7 4H17C18.1 4 19 4.9 19 6V8H5V6C5 4.9 5.9 4 7 4Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="Message..."
              rows={1}
              className="max-h-36 min-h-10 flex-1 resize-y rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-500/35 focus:outline-none"
            />

            <button
              type="submit"
              disabled={loading || input.trim().length === 0}
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-white px-4 text-sm font-semibold text-black hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Send
            </button>
          </div>

          {errorText ? <p className="mt-2 text-xs text-zinc-400">{errorText}</p> : null}
        </form>
      </section>
    </main>
  );
}
