import React from 'react';

export default function AutoPlayBar({ currentIndex, total, isPlaying, onPause, onResume, onNext, onStop }) {
  if (total === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white px-4 py-3 shadow-lg">
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <div className="text-sm font-medium text-gray-700">
          播报进度：{currentIndex + 1} / {total}
        </div>
        <div className="flex items-center gap-2">
          {isPlaying ? (
            <button
              onClick={onPause}
              className="rounded-md bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600"
            >
              暂停
            </button>
          ) : (
            <button
              onClick={onResume}
              className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
            >
              继续
            </button>
          )}
          <button
            onClick={onNext}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            下一条
          </button>
          <button
            onClick={onStop}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
          >
            停止
          </button>
        </div>
      </div>
    </div>
  );
}
