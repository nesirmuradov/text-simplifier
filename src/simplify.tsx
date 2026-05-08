import {
  Action,
  ActionPanel,
  Clipboard,
  Detail,
  Form,
  Icon,
  closeMainWindow,
  getSelectedText,
  showToast,
  Toast,
  getPreferenceValues,
  useNavigation,
} from "@raycast/api";
import { useState, useEffect, useRef } from "react";

interface Preferences {
  apiKey: string;
}

const SYSTEM_PROMPT = `Rewrite the user's text to be shorter and clearer.

Rules:
- Output must be the same length as the input or shorter — never longer. If you cannot make it shorter while preserving meaning, return the input unchanged.
- Preserve labels, tags, prefixes, names, and identifiers exactly. Examples: "Rush -", "[BUG]", proper nouns, ticket numbers, version numbers, code identifiers.
- Don't add information, context, explanations, or speculation that wasn't in the original.
- Use active voice and plain English. Cut filler.
- Don't split one sentence into multiple unless splitting also shortens the total length.

Return only the rewritten text. No preamble, no commentary.`;

export default function Command() {
  const [simplified, setSimplified] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { apiKey } = getPreferenceValues<Preferences>();
  const { push } = useNavigation();
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    simplifyText(controller.signal);
    return () => controller.abort();
  }, []);

  async function simplifyText(signal: AbortSignal) {
    try {
      const selectedText = await getSelectedText();

      if (!selectedText?.trim()) {
        await showToast({ style: Toast.Style.Failure, title: "No text selected" });
        setError("No text selected. Highlight some text and try again.");
        setIsLoading(false);
        return;
      }

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1024,
          stream: true,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: selectedText }],
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        let message = `HTTP ${response.status}`;
        try {
          const parsed = JSON.parse(errorBody);
          message = parsed?.error?.message ?? message;
        } catch {
          if (errorBody) message = errorBody.slice(0, 200);
        }
        throw new Error(message);
      }

      if (!response.body) {
        throw new Error("Empty response body");
      }

      let acc = "";
      for await (const text of parseSSE(response.body, signal)) {
        acc += text;
        setSimplified(acc);
      }

      if (!acc) {
        setError("Claude returned an empty response. Try again.");
      }
    } catch (err) {
      if (signal.aborted || (err instanceof Error && err.name === "AbortError")) {
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      await showToast({ style: Toast.Style.Failure, title: "Error", message });
      setError(message);
    } finally {
      if (!signal.aborted) setIsLoading(false);
    }
  }

  if (error) {
    return (
      <Detail
        navigationTitle="Simplify Failed"
        markdown={`# Error\n\n${error}`}
      />
    );
  }

  return (
    <Detail
      isLoading={isLoading}
      navigationTitle="Simplified Text"
      markdown={simplified}
      actions={
        <ActionPanel>
          <Action
            title="Replace Highlighted Text"
            icon={Icon.Replace}
            onAction={() => replaceSelection(simplified)}
          />
          <Action.CopyToClipboard title="Copy to Clipboard" content={simplified} />
          <Action
            title="Edit"
            icon={Icon.Pencil}
            shortcut={{ modifiers: ["cmd"], key: "e" }}
            onAction={() => push(<EditView initial={simplified} />)}
          />
        </ActionPanel>
      }
    />
  );
}

async function replaceSelection(text: string) {
  if (!text) return;
  await Clipboard.copy(text);
  await Clipboard.paste(text);
  await closeMainWindow();
}

function EditView({ initial }: { initial: string }) {
  const [text, setText] = useState(initial);
  return (
    <Form
      navigationTitle="Edit Result"
      actions={
        <ActionPanel>
          <Action
            title="Replace Highlighted Text"
            icon={Icon.Replace}
            onAction={() => replaceSelection(text)}
          />
          <Action.CopyToClipboard title="Copy to Clipboard" content={text} />
        </ActionPanel>
      }
    >
      <Form.TextArea id="text" title="Simplified Text" value={text} onChange={setText} />
    </Form>
  );
}

async function* parseSSE(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIdx).trim();
        buffer = buffer.slice(newlineIdx + 1);
        if (!line.startsWith("data:")) continue;

        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;

        try {
          const event = JSON.parse(data);
          if (
            event?.type === "content_block_delta" &&
            event?.delta?.type === "text_delta" &&
            typeof event.delta.text === "string"
          ) {
            yield event.delta.text;
          }
        } catch {
          // Skip malformed events
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
