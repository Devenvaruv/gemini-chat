"use client";

// React types + hooks:
// - FormEvent, KeyboardEvent for type-safe event handlers
// - useEffect for side effects (auto-scroll)
// - useRef for direct element references
// - useState for component state
import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

// One chat message object shown in the UI list.
type Message = {
  // Unique key for React list rendering.
  id: string;
  // Sender role controls styling and alignment.
  role: "user" | "assistant";
  // Main text content in the bubble.
  text: string;
  // Optional image preview URL for user-uploaded image messages.
  imageUrl?: string;
};

export default function Home() {
  // Backend base URL. If env var is missing, use localhost backend by default.
  // This string is used in fetch() later as `${backendUrl}/api/chat`.
  const backendUrl =
    process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8000";

  // Conversation history displayed in chat.
  const [messages, setMessages] = useState<Message[]>([]);

  // Current text in the textarea input.
  const [input, setInput] = useState("");

  // Selected image file object (for upload).
  const [imageFile, setImageFile] = useState<File | null>(null);

  // Browser blob URL for rendering selected image preview.
  const [imagePreview, setImagePreview] = useState("");

  // True while waiting for backend response.
  const [loading, setLoading] = useState(false);

  // Small error text shown below input area.
  const [errorText, setErrorText] = useState("");

  // Ref to hidden <input type="file"> so we can trigger it from a custom button.
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Ref to a tiny element at chat bottom for smooth auto-scroll.
  const endRef = useRef<HTMLDivElement>(null);

  // Whenever messages or loading state change, scroll to bottom.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Handles file selection from hidden file input.
  function onPickImage(file: File | null) {
    // If user cancelled file picker, clear image state.
    if (!file) {
      setImageFile(null);
      setImagePreview("");
      return;
    }

    // Store actual file for upload.
    setImageFile(file);

    // Create a temporary local URL to preview image in UI.
    setImagePreview(URL.createObjectURL(file));
  }

  // Clears selected image in state + resets the file input element value.
  function clearImage() {
    setImageFile(null);
    setImagePreview("");

    // Reset file input so selecting the same file again still fires onChange.
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  // Main send function: validates input, appends user message, calls backend, appends assistant reply.
  async function sendMessage() {
    // Trim whitespace so blank spaces are not considered a real message.
    const prompt = input.trim();

    // Block sending if no text or if a request is already running.
    if (!prompt || loading) return;

    // Immediately add user's message to chat for responsive feel (optimistic UI).
    setMessages((prev) => [
      ...prev,
      {
        // Unique id for this bubble.
        id: crypto.randomUUID(),
        role: "user",
        text: prompt,
        // Keep image preview in user bubble if present.
        imageUrl: imagePreview || undefined,
      },
    ]);

    // Clear text input after user sends.
    setInput("");

    // Clear old error when starting a new request.
    setErrorText("");

    // Build multipart form payload expected by backend.
    const form = new FormData();

    // Include recent chat history to provide context for model.
    // Only last 8 messages are included to control prompt size.
    const history = messages
      .slice(-8)
      .map((message) => `${message.role === "user" ? "User" : "Assistant"}: ${message.text}`)
      .join("\n");

    // Final prompt passed to model:
    // - history + current user turn if history exists
    // - otherwise just current prompt
    let promptForModel = history ? `${history}\nUser: ${prompt}` : prompt;

    // If image is attached, append a textual hint to the prompt.
    if (imageFile) {
      promptForModel += "\nUser attached an image to this message.";
    }

    // Add fields to form-data.
    form.set("prompt", promptForModel);
    if (imageFile) form.set("image", imageFile);

    // Reset image picker state after payload is prepared.
    clearImage();

    // Enter loading mode (disables controls and shows thinking bubble).
    setLoading(true);

    try {
      // Send request to backend chat endpoint.
      const response = await fetch(`${backendUrl}/api/chat`, {
        method: "POST",
        body: form,
      });

      // Parse response JSON (works for both success and error payloads).
      const payload = await response.json();

      // Convert non-2xx HTTP response into a thrown error.
      if (!response.ok) {
        throw new Error(payload.error || "Request failed.");
      }

      // Append assistant reply bubble from backend answer text.
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: String(payload.answer || "(No text returned)"),
        },
      ]);
    } catch (error) {
      // Normalize unknown thrown value into a readable message string.
      const message = error instanceof Error ? error.message : "Unexpected error.";

      // Add error message as assistant bubble so user sees it in timeline.
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", text: `Error: ${message}` },
      ]);

      // Also surface concise error below input.
      setErrorText(message);
    } finally {
      // Always leave loading mode, whether request succeeded or failed.
      setLoading(false);
    }
  }

  // Form submit handler (Send button / Enter submit).
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    // Prevent full-page reload.
    event.preventDefault();
    await sendMessage();
  }

  // Keyboard shortcut:
  // - Enter => send
  // - Shift+Enter => newline in textarea
  async function onInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      await sendMessage();
    }
  }

  return (
    // Full-screen page shell.
    <main className="min-h-screen bg-black p-4 text-zinc-100 md:p-8">
      {/* Main chat container card */}
      <section className="mx-auto flex h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950 shadow-[0_20px_60px_rgba(0,0,0,0.55)]">
        {/* Header area with title/subtitle */}
        <header className="border-b border-zinc-800 px-5 py-4 md:px-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.17em] text-zinc-400">
            OpenVINO Vision Chat
          </p>
          <h1 className="mt-1 text-lg font-semibold text-zinc-100 md:text-xl">
            Conversation
          </h1>
        </header>

        {/* Scrollable message list area */}
        <div className="flex-1 overflow-y-auto px-4 py-5 md:px-6">
          {messages.length === 0 ? (
            // Empty state shown before first message.
            <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/70 p-6 text-center text-sm text-zinc-400">
              Start by typing a message. Add an image with the upload icon when needed.
            </div>
          ) : (
            // Chat message list once at least one message exists.
            <div className="space-y-4">
              {messages.map((message) => {
                // User messages are right-aligned; assistant messages left-aligned.
                const isUser = message.role === "user";
                return (
                  <article
                    key={message.id}
                    className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    {/* Bubble style changes by role */}
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 md:max-w-[75%] ${
                        isUser
                          ? "bg-white text-black"
                          : "border border-zinc-700 bg-zinc-900 text-zinc-100"
                      }`}
                    >
                      {/* Bubble role label */}
                      <p
                        className={`mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] ${
                          isUser ? "text-zinc-600" : "text-zinc-400"
                        }`}
                      >
                        {isUser ? "You" : "Assistant"}
                      </p>
                      {message.imageUrl ? (
                        // Optional image displayed for user messages with uploads.
                        <img
                          src={message.imageUrl}
                          alt="User upload"
                          className="mb-3 max-h-64 w-full rounded-xl object-contain"
                        />
                      ) : null}
                      {/* Keep line breaks in displayed text */}
                      <p className="whitespace-pre-wrap text-sm leading-7">{message.text}</p>
                    </div>
                  </article>
                );
              })}
              {loading ? (
                // Temporary assistant placeholder while backend is generating.
                <article className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm italic text-zinc-400 md:max-w-[75%]">
                    Assistant is thinking...
                  </div>
                </article>
              ) : null}
              {/* Invisible bottom anchor for auto-scroll */}
              <div ref={endRef} />
            </div>
          )}
        </div>

        {/* Bottom composer (image picker + text input + send button) */}
        <form
          onSubmit={onSubmit}
          className="border-t border-zinc-800 bg-zinc-950 px-4 py-4 md:px-6"
        >
          {imagePreview ? (
            // Selected image preview strip.
            <div className="mb-3 flex items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-900 p-2">
              <img
                src={imagePreview}
                alt="Selected preview"
                className="h-14 w-14 rounded-lg object-cover"
              />
              <div className="min-w-0 flex-1">
                {/* Show filename with truncation for long names */}
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

          {/* Input row containing upload button, textarea, and submit button */}
          <div className="flex items-end gap-2 md:gap-3">
            {/* Hidden native file input; triggered by custom button below */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(event) => onPickImage(event.target.files?.[0] ?? null)}
              className="hidden"
            />

            {/* Upload icon button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              aria-label="Upload image"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {/* Inline SVG upload icon */}
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

            {/* Prompt textarea */}
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="Message..."
              rows={1}
              className="max-h-36 min-h-10 flex-1 resize-y rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-500/35 focus:outline-none"
            />

            {/* Send button */}
            <button
              type="submit"
              disabled={loading || input.trim().length === 0}
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-white px-4 text-sm font-semibold text-black hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Send
            </button>
          </div>

          {/* Optional error hint below input row */}
          {errorText ? <p className="mt-2 text-xs text-zinc-400">{errorText}</p> : null}
        </form>
      </section>
    </main>
  );
}
