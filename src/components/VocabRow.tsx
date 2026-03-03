"use client";

import { type VocabEntry, type WordState } from "@/lib/data-layer";

interface VocabRowProps {
  entry: VocabEntry;
  bookTitle?: string;
  isSelected: boolean;
  onSelect: (id: string, selected: boolean) => void;
  onClick: (entry: VocabEntry) => void;
}

// State indicator component
function StateIndicator({ state }: { state: WordState }) {
  switch (state) {
    case "new":
    case "level1":
      return (
        <span
          className="inline-block h-3 w-3 rounded-full bg-blue-800"
          title="Level 1 - New"
        />
      );
    case "level2":
      return (
        <span
          className="inline-block h-3 w-3 rounded-full bg-blue-600"
          title="Level 2 - Learning"
        />
      );
    case "level3":
      return (
        <span
          className="inline-block h-3 w-3 rounded-full bg-blue-400"
          title="Level 3 - Familiar"
        />
      );
    case "level4":
      return (
        <span
          className="inline-block h-3 w-3 rounded-full bg-blue-200"
          title="Level 4 - Almost Known"
        />
      );
    case "known":
      return (
        <svg
          className="h-4 w-4 text-green-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={3}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 13l4 4L19 7"
          />
        </svg>
      );
    case "ignored":
      return (
        <span
          className="inline-block h-0.5 w-3 rounded bg-gray-400"
          title="Ignored"
        />
      );
    default:
      return null;
  }
}

// Anki status indicator
function AnkiStatus({
  pushedToAnki,
  ankiNoteId,
}: {
  pushedToAnki: boolean;
  ankiNoteId?: number;
}) {
  if (pushedToAnki) {
    return (
      <span
        className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-200"
        title={ankiNoteId ? `Anki Note ID: ${ankiNoteId}` : "Pushed to Anki"}
      >
        Synced
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
      Not synced
    </span>
  );
}

export default function VocabRow({
  entry,
  bookTitle,
  isSelected,
  onSelect,
  onClick,
}: VocabRowProps) {
  const formattedDate = new Date(entry.createdAt).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <tr
      className="cursor-pointer border-b border-gray-200 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
      onClick={() => onClick(entry)}
    >
      {/* Checkbox */}
      <td className="w-12 px-4 py-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => {
            e.stopPropagation();
            onSelect(entry.id, e.target.checked);
          }}
          onClick={(e) => e.stopPropagation()}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
        />
      </td>

      {/* Word/Phrase */}
      <td className="px-4 py-3">
        <div className="flex flex-col">
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {entry.text}
          </span>
          {entry.type === "phrase" && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              phrase
            </span>
          )}
        </div>
      </td>

      {/* Translation */}
      <td className="max-w-xs px-4 py-3">
        <span className="line-clamp-2 text-gray-700 dark:text-gray-300">
          {entry.translation}
        </span>
      </td>

      {/* State */}
      <td className="px-4 py-3">
        <div className="flex items-center justify-center">
          <StateIndicator state={entry.state} />
        </div>
      </td>

      {/* Source Book */}
      <td className="max-w-[150px] px-4 py-3">
        <span className="line-clamp-1 text-sm text-gray-600 dark:text-gray-400">
          {bookTitle || "-"}
        </span>
      </td>

      {/* Date Added */}
      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
        {formattedDate}
      </td>

      {/* Anki Status */}
      <td className="px-4 py-3">
        <AnkiStatus
          pushedToAnki={entry.pushedToAnki}
          ankiNoteId={entry.ankiNoteId}
        />
      </td>
    </tr>
  );
}

// Export StateIndicator for use elsewhere
export { StateIndicator };
