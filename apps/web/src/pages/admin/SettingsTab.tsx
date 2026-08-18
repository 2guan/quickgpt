import React, { useState, useEffect, useRef } from 'react';
import { adminApi, chatApi } from '../../api/client.js';
import { useSettingsStore } from '../../stores/settingsStore.js';
import {
  Save,
  Loader2,
  Globe,
  Shield,
  Sparkles,
  Check,
  Upload,
  Image as ImageIcon,
  Trash2,
  ExternalLink,
  Volume2,
} from 'lucide-react';

export const SettingsTab: React.FC = () => {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [models, setModels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingWelcomeLogo, setUploadingWelcomeLogo] = useState(false);

  const siteLogoInputRef = useRef<HTMLInputElement>(null);
  const welcomeLogoInputRef = useRef<HTMLInputElement>(null);
  const { updateLocalSettings } = useSettingsStore();

  useEffect(() => {
    async function loadSettings() {
      try {
        const [settingsRes, modelsRes] = await Promise.all([
          adminApi.getSettings(),
          adminApi.getModels().catch(() => ({ models: [] })),
        ]);
        setSettings(settingsRes.settings || {});
        setModels(modelsRes.models || []);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedSuccess(false);
    try {
      await adminApi.updateSettings(settings);
      updateLocalSettings(settings);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (err: any) {
      alert(`保存失败: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>, targetKey: 'site_logo' | 'welcome_logo') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (targetKey === 'site_logo') setUploadingLogo(true);
    else setUploadingWelcomeLogo(true);

    try {
      const res = await chatApi.uploadFile(file);
      const newSettings = { ...settings, [targetKey]: res.url };
      setSettings(newSettings);
      // Auto-save the uploaded logo
      await adminApi.updateSettings(newSettings);
      updateLocalSettings(newSettings);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (err: any) {
      alert(`上传 Logo 失败: ${err.message}`);
    } finally {
      if (targetKey === 'site_logo') setUploadingLogo(false);
      else setUploadingWelcomeLogo(false);
      e.target.value = '';
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600 mx-auto" />
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 animate-in fade-in duration-150">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <span>基础与系统设置 (System Settings)</span>
          </h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            管理站点品牌、Logo 图标、控制台副标题、用户注册策略与搜索引擎适配配置
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-2xs transition-all active:scale-95 disabled:opacity-50 self-start sm:self-auto"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : savedSuccess ? (
            <Check className="w-4 h-4" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          <span>{saving ? '正在保存...' : savedSuccess ? '保存成功！' : '保存设置'}</span>
        </button>
      </div>

      <form onSubmit={handleSave} className="space-y-5 w-full">
        {/* 1. Branding Settings */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-2xs space-y-5 text-xs w-full">
          <div className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>站点展示与品牌 (Branding & Logos)</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Site Title */}
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                站点名称 (Site Title)
              </label>
              <input
                type="text"
                value={settings.site_title || ''}
                placeholder="默认：QuickGPT"
                onChange={(e) => setSettings({ ...settings, site_title: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-500 focus:outline-hidden"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                将同步更新左上角品牌标题、浏览器窗口标题及欢迎标语
              </span>
            </div>

            {/* Site Subtitle */}
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                站点副标题 (Site Subtitle)
              </label>
              <input
                type="text"
                value={settings.site_subtitle || ''}
                placeholder="默认：极速、强大的多模型 AI 对话与创作平台"
                onChange={(e) => setSettings({ ...settings, site_subtitle: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-500 focus:outline-hidden"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                展示于新会话启动页的问候说明文字
              </span>
            </div>

            {/* Admin Console Subtitle */}
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                控制台副标题 (Admin Subtitle)
              </label>
              <input
                type="text"
                value={settings.admin_subtitle || ''}
                placeholder="默认：系统综合管控中心"
                onChange={(e) => setSettings({ ...settings, admin_subtitle: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-500 focus:outline-hidden"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                展示于管理员控制台左上角标题下方
              </span>
            </div>
          </div>

          {/* Logos Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2 border-t border-slate-100 dark:border-slate-800">
            {/* 1. Main Site Logo */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  站点主 Logo (Header & Sidebar)
                </label>
                <span className="text-[10px] text-slate-400">支持 GIF 动图、PNG 透明、SVG、JPG</span>
              </div>

              <div className="flex items-center gap-3">
                {/* Logo Preview Box with checkerboard transparency background */}
                <div
                  className="w-16 h-16 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-center p-1.5 shrink-0 overflow-hidden shadow-2xs relative"
                  style={{
                    backgroundImage:
                      'linear-gradient(45deg, #e2e8f0 25%, transparent 25%), linear-gradient(-45deg, #e2e8f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e8f0 75%), linear-gradient(-45deg, transparent 75%, #e2e8f0 75%)',
                    backgroundSize: '12px 12px',
                    backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0px',
                  }}
                >
                  {settings.site_logo ? (
                    <img
                      src={settings.site_logo}
                      alt="Site Logo"
                      className="w-full h-full object-contain drop-shadow-xs"
                    />
                  ) : (
                    <div className="w-full h-full bg-emerald-600 text-white rounded-xl flex items-center justify-center font-bold text-lg">
                      {(settings.site_title || 'Q').charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>

                {/* Input & Upload Controls */}
                <div className="flex-1 space-y-2 min-w-0">
                  <input
                    type="text"
                    value={settings.site_logo || ''}
                    placeholder="https://... 或 /uploads/logo.png"
                    onChange={(e) => setSettings({ ...settings, site_logo: e.target.value })}
                    className="w-full px-3 py-1.5 font-mono text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-500 focus:outline-hidden"
                  />

                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      ref={siteLogoInputRef}
                      accept="image/*,.gif,.png,.jpg,.jpeg,.svg,.webp"
                      onChange={(e) => handleUploadLogo(e, 'site_logo')}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => siteLogoInputRef.current?.click()}
                      disabled={uploadingLogo}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-medium border border-slate-200/80 dark:border-slate-700 transition-all active:scale-95 disabled:opacity-50"
                    >
                      {uploadingLogo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5 text-emerald-600" />}
                      <span>{uploadingLogo ? '上传中...' : '上传图片 / GIF'}</span>
                    </button>

                    {settings.site_logo && (
                      <button
                        type="button"
                        onClick={() => setSettings({ ...settings, site_logo: '' })}
                        className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors"
                        title="清空并恢复默认"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Welcome Screen Center Logo */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  聊天启动页中间 Logo (Welcome Screen Logo)
                </label>
                <span className="text-[10px] text-slate-400">留空时将默认沿用主 Logo</span>
              </div>

              <div className="flex items-center gap-3">
                {/* Logo Preview Box */}
                <div
                  className="w-16 h-16 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-center p-1.5 shrink-0 overflow-hidden shadow-2xs relative"
                  style={{
                    backgroundImage:
                      'linear-gradient(45deg, #e2e8f0 25%, transparent 25%), linear-gradient(-45deg, #e2e8f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e8f0 75%), linear-gradient(-45deg, transparent 75%, #e2e8f0 75%)',
                    backgroundSize: '12px 12px',
                    backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0px',
                  }}
                >
                  {settings.welcome_logo || settings.site_logo ? (
                    <img
                      src={settings.welcome_logo || settings.site_logo}
                      alt="Welcome Logo"
                      className="w-full h-full object-contain drop-shadow-xs"
                    />
                  ) : (
                    <div className="w-full h-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 rounded-xl flex items-center justify-center">
                      <Sparkles className="w-6 h-6 animate-pulse" />
                    </div>
                  )}
                </div>

                {/* Input & Upload Controls */}
                <div className="flex-1 space-y-2 min-w-0">
                  <input
                    type="text"
                    value={settings.welcome_logo || ''}
                    placeholder="https://... 或 /uploads/welcome_logo.gif"
                    onChange={(e) => setSettings({ ...settings, welcome_logo: e.target.value })}
                    className="w-full px-3 py-1.5 font-mono text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-500 focus:outline-hidden"
                  />

                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      ref={welcomeLogoInputRef}
                      accept="image/*,.gif,.png,.jpg,.jpeg,.svg,.webp"
                      onChange={(e) => handleUploadLogo(e, 'welcome_logo')}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => welcomeLogoInputRef.current?.click()}
                      disabled={uploadingWelcomeLogo}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-medium border border-slate-200/80 dark:border-slate-700 transition-all active:scale-95 disabled:opacity-50"
                    >
                      {uploadingWelcomeLogo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5 text-emerald-600" />}
                      <span>{uploadingWelcomeLogo ? '上传中...' : '上传图片 / GIF'}</span>
                    </button>

                    {settings.welcome_logo && (
                      <button
                        type="button"
                        onClick={() => setSettings({ ...settings, welcome_logo: '' })}
                        className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors"
                        title="清空并恢复沿用主 Logo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              自定义页脚 (Footer Text)
            </label>
            <input
              type="text"
              value={settings.site_footer || ''}
              placeholder="如：© 2026 QuickGPT. All rights reserved."
              onChange={(e) => setSettings({ ...settings, site_footer: e.target.value })}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-500 focus:outline-hidden"
            />
          </div>
        </div>

        {/* 2. Security & Registration Mode */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-2xs space-y-4 text-xs w-full">
          <div className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
            <Shield className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <span>注册策略与安全 (Security & Registration)</span>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">用户注册模式</label>
            <select
              value={settings.registration_mode || 'OPEN'}
              onChange={(e) => setSettings({ ...settings, registration_mode: e.target.value })}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-500 focus:outline-hidden"
            >
              <option value="OPEN">公开开放注册 (默认注册后为待审核状态)</option>
              <option value="CLOSED">完全关闭新用户注册</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">全局默认 System Prompt 提示词</label>
            <textarea
              rows={3}
              value={settings.global_system_prompt || ''}
              onChange={(e) => setSettings({ ...settings, global_system_prompt: e.target.value })}
              placeholder="例如: You are a helpful, brilliant AI assistant."
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-500 focus:outline-hidden"
            />
          </div>
        </div>

        {/* 3. Search Engine Provider */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-2xs space-y-4 text-xs w-full">
          <div className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
            <Globe className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>联网搜索引擎配置 (Search Engine Fallback)</span>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">搜索引擎提供商</label>
            <select
              value={settings.search_provider || 'builtin'}
              onChange={(e) => setSettings({ ...settings, search_provider: e.target.value })}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-500 focus:outline-hidden"
            >
              <option value="builtin">内置免费搜索引擎 (无需任何配置)</option>
              <option value="searxng">SearXNG 自建搜索实例</option>
              <option value="tavily">Tavily AI Search API</option>
              <option value="serpapi">SerpAPI (Google Search)</option>
            </select>
          </div>

          {settings.search_provider === 'searxng' && (
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">SearXNG 实例 API 地址</label>
                <input
                  type="url"
                  placeholder="https://your-searxng-domain.com"
                  value={settings.search_endpoint || ''}
                  onChange={(e) => setSettings({ ...settings, search_endpoint: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl focus:border-emerald-500 focus:outline-hidden font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">SearXNG API 密钥 (可选)</label>
                <input
                  type="password"
                  placeholder="如有配置访问密码请输入"
                  value={settings.search_api_key || ''}
                  onChange={(e) => setSettings({ ...settings, search_api_key: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl focus:border-emerald-500 focus:outline-hidden font-mono"
                />
              </div>
            </div>
          )}

          {(settings.search_provider === 'tavily' || settings.search_provider === 'serpapi') && (
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">API Key 密钥</label>
                <input
                  type="password"
                  placeholder={settings.search_provider === 'tavily' ? 'tvly-...' : 'SerpAPI key...'}
                  value={settings.search_api_key || ''}
                  onChange={(e) => setSettings({ ...settings, search_api_key: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl focus:border-emerald-500 focus:outline-hidden font-mono"
                />
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              联网搜索前置关键词提炼模型 (Search Query Model)
            </label>
            <select
              value={settings.search_query_model_id || 'auto'}
              onChange={(e) => setSettings({ ...settings, search_query_model_id: e.target.value })}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-500 focus:outline-hidden"
            >
              <option value="auto">自动跟随当前对话模型（或优先使用小米 mimo-v2.5）</option>
              {models
                .filter((m: any) => m.model_type === 'chat' && m.is_active === 1)
                .map((m: any) => (
                  <option key={m.id} value={m.model_id}>
                    {m.name || m.model_id} ({m.model_id})
                  </option>
                ))}
            </select>
            <span className="text-[10px] text-slate-400 mt-1 block">
              联网搜索前，系统自动将用户提问交由此模型（关闭思考模式极速返回），生成 1~3 个核心搜索关键句子并多路检索，每个句子返回 3 条网页结果汇聚后供给大模型回答。
            </span>
          </div>
        </div>

        {/* 4. Follow-up Suggestions Configuration */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-2xs space-y-4 text-xs w-full">
          <div className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>智能追问建议设置 (Follow-up Suggestions)</span>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              追问建议全局触发策略
            </label>
            <select
              value={settings.enable_global_followup ?? '1'}
              onChange={(e) => setSettings({ ...settings, enable_global_followup: e.target.value })}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-500 focus:outline-hidden"
            >
              <option value="1">✨ 全局默认开启（回答结束后自动生成 3 个相关追问选项）</option>
              <option value="0">🔒 仅在模型管理中单独开启的模型触发</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              全局默认追问模型 (可单独指定轻量极速模型)
            </label>
            <select
              value={settings.global_followup_model_id || ''}
              onChange={(e) => setSettings({ ...settings, global_followup_model_id: e.target.value })}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-500 focus:outline-hidden"
            >
              <option value="">跟随当前对话主模型（默认）</option>
              {models
                .filter((m) => m.is_active)
                .map((m) => (
                  <option key={m.id} value={m.model_id}>
                    {m.display_name} ({m.model_id})
                  </option>
                ))}
            </select>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
              建议指定轻量且响应极快的大模型（如 gpt-4o-mini, qwen-turbo, deepseek-chat 等），在回答完毕后秒级输出追问提示。
            </p>
          </div>
        </div>

        {/* 5. Speech Synthesis / TTS Configuration */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-2xs space-y-4 text-xs w-full">
          <div className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
            <Volume2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>语音朗读与语音合成设置 (Text-to-Speech / TTS)</span>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              全局统一朗读模型 (Global TTS Model)
            </label>
            <select
              value={settings.global_tts_model_id || ''}
              onChange={(e) => setSettings({ ...settings, global_tts_model_id: e.target.value })}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-500 focus:outline-hidden"
            >
              <option value="">自动检测活跃 TTS 模型 (如 mimo-v2.5-tts / tts-1)</option>
              {models
                .filter((m) => m.is_active)
                .map((m) => (
                  <option key={m.id} value={m.model_id}>
                    {m.display_name} ({m.model_id})
                  </option>
                ))}
            </select>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
              支持小米 MiMo-V2.5-TTS（低延迟流式 PCM16/WAV 极速播报）以及标准 OpenAI /v1/audio/speech 语音模型。未配置时自动使用浏览器本地语音合成。
            </p>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              默认音色名称 (Default Voice)
            </label>
            <input
              type="text"
              value={settings.global_tts_voice || 'Chloe'}
              onChange={(e) => setSettings({ ...settings, global_tts_voice: e.target.value })}
              placeholder="如：Chloe, 冰糖, 茉莉, alloy, nova 等"
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-500 focus:outline-hidden"
            />
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
              小米 MiMo 官方常用音色：Chloe, 冰糖, 茉莉；OpenAI 官方常用音色：alloy, nova, shimmer, echo。
            </p>
          </div>
        </div>
      </form>
    </div>
  );
};
