import { ANCHOR_VOICES, resolveAnchorVoice, resolveSpeechVoices } from '../services/speech.js';

const previewText = '各位好，欢迎收听新闻。今天我们关注 Android 16 的最新进展，以及人工智能在移动设备上的应用。';

const englishPreviewText = 'Good evening. Here are today’s headlines. Android 16 brings new features to mobile devices.';

export default function TtsSettings({ settings, onChange, voices = [], onPreview }) {
  const chineseVoices = voices.filter((voice) => /^zh(?:-|$)/i.test(voice.lang));
  const anchors = ANCHOR_VOICES.map((preset) => ({ ...preset, voice: resolveAnchorVoice(voices, preset) }));
  const selectedAnchor = anchors.find(({ id }) => id === settings.voiceURI);
  const englishVoices = voices.filter((voice) => /^en(?:-|$)/i.test(voice.lang));
  const { chinese, english } = resolveSpeechVoices(voices, settings.voiceURI, settings.englishVoiceURI);
  const selectedEnglishURI = englishVoices.some((voice) => voice.voiceURI === settings.englishVoiceURI)
    ? settings.englishVoiceURI
    : '';

  return (
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
            中文播报音色
          </label>
          <div className="mt-1 flex items-center gap-3">
            <select
              id="voice"
              value={settings.voiceURI || ''}
              onChange={(e) => onChange({ voiceURI: e.target.value || '' })}
              className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="">自动选择（优先自然普通话）</option>
              <optgroup label="主持人音色">
                {anchors.map(({ id, label, voice }) => (
                  <option key={id} value={id} disabled={!voice}>
                    {label}{voice ? ` · ${voice.name}` : '（当前设备不可用）'}
                  </option>
                ))}
              </optgroup>
              <optgroup label="设备中文音色">
                {chineseVoices.map((voice) => (
                  <option key={voice.voiceURI} value={voice.voiceURI}>
                    {voice.name} ({voice.lang})
                  </option>
                ))}
              </optgroup>
            </select>
            <button
              onClick={() => onPreview(previewText)}
              className="rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
            >
              试听
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {selectedAnchor && !selectedAnchor.voice && `${selectedAnchor.label}音色当前不可用。已自动选择可用语音。 `}
            {chinese ? `当前使用 ${chinese.name}。` : '未检测到中文语音，浏览器将使用默认语音。'}
          </p>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="english-voice" className="block text-xs font-medium text-gray-700">
            英文播报音色
          </label>
          <div className="mt-1 flex items-center gap-3">
            <select
              id="english-voice"
              value={selectedEnglishURI}
              onChange={(e) => onChange({ englishVoiceURI: e.target.value })}
              disabled={!english}
              className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-100"
            >
              <option value="">自动选择（优先自然英语）</option>
              {englishVoices.map((voice) => (
                <option key={voice.voiceURI} value={voice.voiceURI}>
                  {voice.name} ({voice.lang})
                </option>
              ))}
            </select>
            <button
              onClick={() => onPreview(englishPreviewText)}
              disabled={!english}
              className="shrink-0 rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
            >
              试听英文
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {english
              ? `当前使用 ${english.name}。`
              : '当前浏览器未提供英文语音。安装或启用设备的英语语音后可选择。'}
          </p>
        </div>

        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-700">全部播报的默认范围</label>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => onChange({ defaultMode: 'title' })}
              aria-pressed={settings.defaultMode === 'title'}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                settings.defaultMode === 'title'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              仅标题
            </button>
            <button
              onClick={() => onChange({ defaultMode: 'summary' })}
              aria-pressed={settings.defaultMode === 'summary'}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                settings.defaultMode === 'summary'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              标题和摘要
            </button>
            <button
              onClick={() => onChange({ defaultMode: 'full' })}
              aria-pressed={settings.defaultMode === 'full'}
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
  );
}
