import { Lightbulb } from "lucide-react";
import { DidYouKnowExpandButton } from "./MediaDidYouKnow";

const INITIAL_COUNT = 3;

interface MediaDidYouKnowServerProps {
  facts: string[];
}

export function MediaDidYouKnow({ facts }: MediaDidYouKnowServerProps) {
  if (facts.length === 0) return null;

  return (
    <div className="mt-8">
      <h2 className="text-2xl font-bold mb-4 text-white flex items-center gap-2">
        <Lightbulb className="w-6 h-6 text-yellow-400" />
        Did You Know?
      </h2>
      <div className="bg-gray-800 rounded-lg divide-y divide-gray-700">
        {facts.map((fact, i) => (
          <div
            key={i}
            className={`px-5 py-3.5 flex gap-3 items-start${i >= INITIAL_COUNT ? " dyk-extra" : ""}`}
          >
            <span className="text-yellow-400 font-bold text-sm shrink-0 mt-0.5">
              #{i + 1}
            </span>
            <p className="text-gray-300 text-sm leading-relaxed">{fact}</p>
          </div>
        ))}
      </div>
      <DidYouKnowExpandButton
        total={facts.length}
        initialCount={INITIAL_COUNT}
      />
    </div>
  );
}
