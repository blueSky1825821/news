import UserSettings from './UserSettings.jsx';

export default function TtsSettings({ settings, onChange, user, onUpdateCategories, voices = [] }) {
  const chineseVoices = voices.filter((v) => v.lang?.toLowerCase().startsWith('zh'));
  const selectedVoice = voices.find((v) => v.voiceURI === settings.voiceURI);

  const previewVoice = () => {
    if (!window.speechSynthesis) return;
    const text = '你好，这是当前选中的播报嗓音。';
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = settings.rate;
    utterance.pitch = settings.pitch;
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-gray-900">播报设置</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="rate" className="block text-xs font-medium text-gray-700">
              语速 ({settings.rate.toFixed(2)}x)
            </label>
            <input
              id="rate"
              type="range"
              min={0.7}
              max={1.5}
              step={0.05}
              value={settings.rate}
              onChange={(e) => onChange({ rate: parseFloat(e.target.value) })}
              className="mt-1 w-full accent-blue-600"
            />
            <div className="flex justify-between text-xs text-gray-400">
              <span>慢</span>
              <span>快</span>
            </div>
          </div>

          <div>
            <label htmlFor="pitch" className="block text-xs font-medium text-gray-700">
              音调 ({settings.pitch.toFixed(2)})
            </label>
            <input
              id="pitch"
              type="range"
              min={0.8}
              max={1.2}
              step={0.05}
              value={settings.pitch}
              onChange={(e) => onChange({ pitch: parseFloat(e.target.value) })}
              className="mt-1 w-full accent-blue-600"
            />
            <div className="flex justify-between text-xs text-gray-400">
              <span>低</span>
              <span>高</span>
            </div>
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="voice" className="block text-xs font-medium text-gray-700">
              播报嗓音
            </label>
            <div className="mt-1 flex items-center gap-3">
              <select
                id="voice"
                value={settings.voiceURI || ''}
                onChange={(e) => onChange({ voiceURI: e.target.value || '' })}
                className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="">浏览器默认</option>
                {chineseVoices.map((voice) => (
                  <option key={voice.voiceURI} value={voice.voiceURI}>
                    {voice.name} ({voice.lang})
                  </option>
                ))}
              </select>
              <button
                onClick={previewVoice}
                className="rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
              >
                试听
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {chineseVoices.length > 0
                ? `检测到 ${chineseVoices.length} 个中文语音，选择更自然的嗓音可改善播报效果。`
                : '未检测到中文语音，浏览器将回退到默认语音。'}
            </p>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-700">默认播报模式</label>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => onChange({ defaultMode: 'summary' })}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  settings.defaultMode === 'summary'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                摘要
              </button>
              <button
                onClick={() => onChange({ defaultMode: 'full' })}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  settings.defaultMode === 'full'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                全文
              </button>
            </div>
          </div>
        </div>
      </div>

      {user && (
        <UserSettings user={user} onUpdateCategories={onUpdateCategories} />
      )}
    </div>
  );
}
