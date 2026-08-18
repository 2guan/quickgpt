import React, { useEffect, useRef, useState } from 'react';
import { useChatStore } from '../stores/chatStore.js';
import { useAuthStore } from '../stores/authStore.js';
import { useSettingsStore } from '../stores/settingsStore.js';
import { chatApi } from '../api/client.js';
import { Sidebar } from '../components/chat/Sidebar.js';
import { Header } from '../components/chat/Header.js';
import { MessageItem } from '../components/chat/MessageItem.js';
import { MessageInput } from '../components/chat/MessageInput.js';
import { LoginModal, RegisterModal, ChangePasswordModal } from '../components/auth/AuthModals.js';
import { AdminLayout } from './admin/AdminLayout.js';
import { SharePage } from './SharePage.js';
import { Model, Message } from '../types/index.js';
import { Sparkles, ArrowDown, Bot, Copy, Check, X, Share2 } from 'lucide-react';

interface ChatPageProps {
  onOpenAdmin?: () => void;
}

export const ChatPage: React.FC<ChatPageProps> = ({ onOpenAdmin }) => {
  const {
    messages,
    fetchModels,
    fetchConversations,
    sendMessage,
    isStreaming,
    currentConversationId,
    selectedModelIds,
    models,
  } = useChatStore();

  const { user, checkAuth } = useAuthStore();
  const { settings } = useSettingsStore();

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);

  // Share Modal
  const [shareModalData, setShareModalData] = useState<{ url: string; code: string } | null>(null);
  const [copiedShare, setCopiedShare] = useState(false);

  const messageEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  // Initialize models and conversations
  useEffect(() => {
    checkAuth();
    fetchModels();
    if (user && user.role !== 'PENDING') {
      fetchConversations();
    }
  }, [user?.role]);

  // Scroll to bottom on streaming or new messages
  useEffect(() => {
    if (!showScrollBottom) {
      messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isStreaming]);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isUp = scrollHeight - scrollTop - clientHeight > 120;
    setShowScrollBottom(isUp);
  };

  const scrollToBottom = () => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowScrollBottom(false);
  };

  const handleShareCurrent = async (convId?: string) => {
    const targetId = convId || currentConversationId;
    if (!targetId || messages.length === 0) {
      alert('当前对话暂无内容可供分享，请先发送一条消息。');
      return;
    }
    try {
      const res = await chatApi.createShare(targetId);
      const fullUrl = `${window.location.origin}/share/${res.shareCode}`;
      setShareModalData({ url: fullUrl, code: res.shareCode });
    } catch (err: any) {
      alert(err.message || '生成分享链接失败');
    }
  };

  // Check URL routing for /admin and /share/:code
  const path = window.location.pathname;
  if (path.startsWith('/admin')) {
    return <AdminLayout onBackToChat={() => (window.location.pathname = '/')} />;
  }

  const shareMatch = path.match(/^\/share\/([a-zA-Z0-9_-]+)/);
  if (shareMatch) {
    const shareCode = shareMatch[1];
    return <SharePage shareCode={shareCode} onBackToHome={() => (window.location.pathname = '/')} />;
  }

  // Group messages into turn pairs (User Msg + Multi-model Assistant Msgs)
  const groupedTurns = () => {
    const turns: Array<{ userMessage?: Message; assistantMessages: Message[] }> = [];
    let currentTurn: { userMessage?: Message; assistantMessages: Message[] } | null = null;

    for (const msg of messages) {
      if (msg.role === 'user') {
        if (currentTurn) turns.push(currentTurn);
        currentTurn = { userMessage: msg, assistantMessages: [] };
      } else if (msg.role === 'assistant') {
        if (!currentTurn) {
          currentTurn = { assistantMessages: [msg] };
        } else {
          currentTurn.assistantMessages.push(msg);
        }
      }
    }
    if (currentTurn) turns.push(currentTurn);
    return turns;
  };

  const groupedTurnList = groupedTurns();
  // 40 Diversified, interesting & simple conversation prompts
  const PROMPT_SUGGESTIONS_POOL = [
    { title: '🐱 成为猫咪翻译官', desc: '解读猫咪各种叫声、摇尾巴和呼噜声的心理活动', prompt: '请扮演一位资深的猫咪心理学专家，幽默生动地翻译一下猫咪对人类各种行为的真实想法。' },
    { title: '🍳 冰箱剩菜大变身', desc: '根据现有的简单食材推荐快手美味料理', prompt: '我的冰箱里只有鸡蛋、番茄和一点剩米饭，请教我做两道既快手又好吃的创意料理。' },
    { title: '☕ 咖啡风味鉴赏指南', desc: '从拿铁到手冲，挑选最适合你今日心情的咖啡', prompt: '请用通俗生动的语言为咖啡小白科普一下美式、拿铁、卡布奇诺和手冲咖啡的口感区别。' },
    { title: '🚀 时空穿梭到古代', desc: '假如带着现代手机穿越回唐朝的一天', prompt: '假如我带着一部充满电的现代智能手机穿越到了盛唐长安，会发生哪些啼笑皆非的趣事？' },
    { title: '🌌 宇宙冷知识大揭秘', desc: '那些颠覆认知却真实存在的奇妙天文现象', prompt: '请告诉我 3 个听起来像科幻小说、但科学上真实存在的浪漫宇宙冷知识。' },
    { title: '✈️ 穷游周末去哪儿', desc: '预算 500 元以内好玩又解压的短途游灵感', prompt: '请为打工人推荐一套人均预算 500 元以内、两天一夜轻松解压的短途周边游规划思路。' },
    { title: '🎬 拯救剧荒大作战', desc: '根据你最喜欢的题材挖掘高分冷门宝藏佳作', prompt: '我想看一部节奏紧凑、反转不断但不太烂大街的悬疑高分电影，请推荐 3 部并简述看点。' },
    { title: '🤖 人工智能会做梦吗', desc: '用科幻与哲学探讨 AI 的意识与思维世界', prompt: '如果未来 AI 拥有了意识并开始做梦，它的梦境会是由什么构成的？请写一段充满诗意的幻想。' },
    { title: '🌿 办公桌绿植养成记', desc: '适合懒人和办公室新手的治愈植物推荐', prompt: '请推荐 3 种极难养死、适合放在电脑桌旁的治愈系绿植，并附上傻瓜式养护技巧。' },
    { title: '🧘 3分钟办公室肩颈拉伸', desc: '告别久坐僵硬，随时随地能做的放松动作', prompt: '请教我一套坐在工位上就能做的 3 分钟肩颈和腰部放松拉伸动作，无需任何辅助器材。' },
    { title: '🕵️ 逻辑推理小探案', desc: '玩一个互动式微型密室推理侦探小游戏', prompt: '请出一段简短精妙的微型密室推理案件，让我来猜凶手和作案手法，先不要公布答案哦！' },
    { title: '🐶 狗狗尾巴的秘密语言', desc: '秒懂修狗开心的转圈和警惕的小动作', prompt: '狗狗向右摇尾巴和向左摇尾巴代表什么不同情绪？请科普狗狗奇妙的肢体语言。' },
    { title: '📚 每天读懂一本书', desc: '用 5 分钟速读经典名著的核心精髓', prompt: '请用风趣且深入浅出的大白话，在 500 字内讲透《人类简史》最震撼人心的核心观点。' },
    { title: '🛌 快速入眠催眠故事', desc: '温柔放松的助眠引导，带你进入甜美梦乡', prompt: '请为我写一段轻柔、温暖、充满大自然意境的睡前催眠小短文，帮我放松神经快速入睡。' },
    { title: '🎮 经典游戏设计哲学', desc: '为什么俄罗斯方块和马里奥如此令人着迷', prompt: '从心理学和游戏机制角度，分析一下《俄罗斯方块》为什么能让人停不下来几十年？' },
    { title: '🏖️ 理想海岛避世清单', desc: '远离人挤人的小众绝美海岛度假指南', prompt: '请推荐两个性价比超高、海水清澈且没有过度商业化的小众海岛，并说明最佳游玩季节。' },
    { title: '🍜 深夜食堂温暖治愈', desc: '写一段关于路边热气腾腾小面馆的美食故事', prompt: '请写一篇短小温暖的深夜食堂故事：冬夜里一家巷尾小面馆中陌生人之间传递的善意。' },
    { title: '🧠 记忆力超强大脑法', desc: '用记忆宫殿法轻松记住长串数字和名单', prompt: '请用一个通俗易懂的实际案例，教我如何用“记忆宫殿法”快速记住 10 个不相关的词语。' },
    { title: '💡 拒绝精神内耗指南', desc: '当代年轻人保持情绪稳定与松弛感的秘诀', prompt: '当我陷入焦虑和自我怀疑时，有哪 3 个简单有效的思维转换工具可以帮我快速恢复松弛感？' },
    { title: '🎨 零基础色彩搭配美学', desc: '日常穿搭与海报设计的经典配色公式', prompt: '请分享 3 套万能且高级的日常色彩搭配方案（如莫兰迪色、大地色等），适合穿搭或设计。' },
    { title: '⚡ 极客高效打字与快捷键', desc: '掌握这几个快捷键让电脑操作行云流水', prompt: '请推荐 5 个无论 Mac 还是 Windows 上都能大幅提升日常办公效率的神级快捷键组合与技巧。' },
    { title: '🥑 超快手健康减脂减负餐', desc: '少油少盐但依然香喷喷的 10 分钟食谱', prompt: '请提供一份适合上班族的 10 分钟低卡减脂午餐便当方案，营养均衡且食材容易准备。' },
    { title: '🎧 深度工作专注背景音', desc: '白噪音、Lo-Fi 与古典乐如何激发灵感', prompt: '不同类型的背景音乐（如粉红噪音、Lo-Fi、巴赫古典乐）对大脑专注度有什么科学影响？' },
    { title: '⛺ 新手第一次露营装备', desc: '不踩雷、不花冤枉钱的精简露营清单', prompt: '如果我想在周末去公园或近郊草地初次体验轻露营，最核心必备的 5 件基础装备是什么？' },
    { title: '🧬 趣味人体冷知识', desc: '你的身体藏着哪些意想不到的神奇功能', prompt: '请分享 3 个关于人类大脑或身体器官非常神奇、让人大呼“原来如此”的趣味冷知识。' },
    { title: '📝 打造爆款标题的魔法', desc: '如何给文章和文案起一个让人忍不住点开的标题', prompt: '请总结 4 种经典的文案吸睛标题公式，并以“早起养成好习惯”为主题各举一个生动例子。' },
    { title: '🎸 零基础音乐入门常识', desc: '简谱与吉他尤克里里和弦的秒懂秘籍', prompt: '请用极简生动的大白话解释什么是“和弦”以及为什么音乐里的 1-3-5 和弦听起来很和谐？' },
    { title: '🪐 假如地球没有月亮', desc: '推演如果月球消失地球生态会发生什么', prompt: '假如有一天月亮突然从夜空中消失了，地球上的潮汐、天气和生物节律会发生怎样戏剧性的变化？' },
    { title: '🤝 巧妙拒绝他人的高情商沟通', desc: '既不委屈自己又能体面礼貌拒绝的话术', prompt: '当遇到朋友借钱或同事甩锅不合理的加班要求时，有哪些得体、坚定又高情商的拒绝话术？' },
    { title: '🍵 中国六大茶类入门', desc: '绿白黄青红黑，一分钟分清各种茶叶特征', prompt: '请在一分钟速览中清晰解释绿茶、红茶、乌龙茶、白茶、黄茶和黑茶的核心工艺与风味差异。' },
    { title: '🏕️ 荒野求生小技巧', desc: '如果在野外迷路如何辨别方向与寻找水源', prompt: '在没有任何电子设备的情况下，野外有哪些可靠自然的辨别方向和寻找饮用水的求生常识？' },
    { title: '🔮 假如动物会说话', desc: '如果家里的家具和宠物突然开口吐槽', prompt: '请写一段小短剧：主人下班回到家，家里的猫咪、扫地机器人和沙发开始七嘴八舌地争论。' },
    { title: '🎙️ 播客主持人的发声秘诀', desc: '如何让自己的声音听起来更有磁性与魅力', prompt: '日常说话如何练习胸腔共鸣和气息控制，让声音听起来更沉稳、清晰且富有亲和力？' },
    { title: '🌱 阳台蔬菜种植小妙招', desc: '用花盆种出吃不完的小葱、辣椒和薄荷', prompt: '有哪些适合在家庭小阳台花盆里种植、生长极快且随采随吃的蔬菜香草？请附简要栽种方法。' },
    { title: '🏎️ 超级跑车的空气动力学', desc: '尾翼与扩散器是如何把赛车按在地面上的', prompt: '用中学生都能听懂的生动语言解释下压力（Downforce）和地面效应是如何让 F1 赛车飞速过弯的。' },
    { title: '🧩 每天一个思维模型', desc: '学会第一性原理和费曼学习法解决复杂问题', prompt: '请用通俗案例阐述“第一性原理”与“类比思维”的本质区别，以及如何用它解决日常工作难题。' },
    { title: '🧗 攀岩新手的初体验', desc: '抱石运动为什么让人欲罢不能的解题乐趣', prompt: '为什么人们把室内抱石攀岩称为“墙上的几何谜题”？新手初次去攀岩馆有哪些注意事项？' },
    { title: '📻 复古未来主义美学', desc: '八十年代人们幻想的 2026 年是怎样的', prompt: '赛博朋克与蒸汽朋克美学有什么核心区别？请描述一个充满霓虹雨夜与飞艇的复古未来城市。' },
    { title: '🍰 烘焙不翻车的科学秘密', desc: '戚风蛋糕为什么会塌陷？泡打粉和酵母的区别', prompt: '做蛋糕时糖除了增加甜味还有什么物理化学作用？怎样做才能保证戚风蛋糕蓬松不塌陷？' },
    { title: '🎪 假如世界重力减半', desc: '脑洞大开：如果地心引力突然减少 50%', prompt: '假如明早醒来地球重力突然减半，我们的城市建筑、交通工具和体育比赛会变成什么模样？' }
  ];

  // Randomly sample 4 unique suggestions on mount or conversation reset
  const [sampledSuggestions, setSampledSuggestions] = useState<typeof PROMPT_SUGGESTIONS_POOL>([]);

  useEffect(() => {
    const shuffled = [...PROMPT_SUGGESTIONS_POOL].sort(() => 0.5 - Math.random());
    setSampledSuggestions(shuffled.slice(0, 4));
  }, [currentConversationId]);

  const activeModelsList = models.filter((m) => selectedModelIds.includes(m.model_id));

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white dark:bg-[#131316] text-slate-800 dark:text-slate-100 transition-colors duration-150">
      {/* 1. Left Sidebar */}
      <Sidebar
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        onOpenLogin={() => setIsLoginOpen(true)}
        onOpenRegister={() => setIsRegisterOpen(true)}
        onOpenChangePassword={() => setIsChangePasswordOpen(true)}
        onNavigateAdmin={onOpenAdmin || (() => (window.location.pathname = '/admin'))}
        onShareConversation={(id: string) => handleShareCurrent(id)}
      />

      {/* 2. Main Chat Workspace */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative bg-white dark:bg-[#131316]">
        {/* Top Header */}
        <Header
          onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
          onShare={() => handleShareCurrent()}
        />

        {/* Messages Scroll Container */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 sm:px-8 md:px-12 lg:px-16 py-6 relative bg-white dark:bg-[#131316]"
        >
          {messages.length === 0 ? (
            /* Welcome / Hero state */
            <div className="max-w-3xl mx-auto min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
              {settings.welcome_logo || settings.site_logo ? (
                <div className="mb-4 flex items-center justify-center">
                  <img
                    src={settings.welcome_logo || settings.site_logo}
                    alt={settings.site_title || 'Logo'}
                    className="max-h-20 max-w-48 object-contain drop-shadow-xs select-none"
                  />
                </div>
              ) : (
                <div className="w-14 h-14 rounded-3xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-800 flex items-center justify-center mb-4 shadow-sm">
                  <Sparkles className="w-7 h-7 animate-pulse" />
                </div>
              )}

              <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">
                {settings.site_title ? `欢迎使用 ${settings.site_title}` : '今天有什么可以帮您？'}
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 dark:text-slate-500 mt-1.5 mb-8">
                {settings.site_subtitle || '支持多模型并行对比、文档即时解析、LaTeX 数学公式与实时联网搜索'}
              </p>

              {/* Active models indicator */}
              <div className="flex flex-wrap justify-center gap-2 mb-8">
                {activeModelsList.map((m: Model) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-100/90 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-2xs"
                  >
                    <Bot className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>{m.display_name}</span>
                  </div>
                ))}
              </div>

              {/* Prompt Suggestion Cards (Random 4 from 40 pool) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full text-left">
                {sampledSuggestions.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => sendMessage(item.prompt)}
                    className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 shadow-2xs transition-all text-xs group active:scale-[0.99]"
                  >
                    <div className="font-semibold text-slate-800 dark:text-slate-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors text-[13px]">
                      {item.title}
                    </div>
                    <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 leading-relaxed">
                      {item.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Render Grouped Message Turns */
            <div className="space-y-6 pb-6 max-w-4xl lg:max-w-5xl mx-auto w-full">
              {groupedTurnList.map((turn, idx) => (
                <MessageItem
                  key={turn.userMessage?.id || `turn_${idx}`}
                  userMessage={turn.userMessage}
                  assistantMessages={turn.assistantMessages}
                  onFollowUpSelect={(text: string) => sendMessage(text)}
                />
              ))}
              <div ref={messageEndRef} />
            </div>
          )}

          {/* Floating Back to Bottom Button */}
          {showScrollBottom && (
            <button
              onClick={scrollToBottom}
              className="fixed bottom-24 right-6 sm:right-10 p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-full shadow-lg transition-all active:scale-95 animate-in fade-in"
              title="回到底部"
            >
              <ArrowDown className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* 3. Bottom Single Unified Input Bar */}
        <MessageInput onSend={(text: string) => sendMessage(text)} />
      </div>

      {/* Auth Modals */}
      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        onSwitchToRegister={() => {
          setIsLoginOpen(false);
          setIsRegisterOpen(true);
        }}
      />
      <RegisterModal
        isOpen={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
        onSwitchToLogin={() => {
          setIsRegisterOpen(false);
          setIsLoginOpen(true);
        }}
      />
      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
      />

      {/* Share Success Modal */}
      {shareModalData && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Share2 className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">对话公开分享链接已生成</h3>
              </div>
              <button
                onClick={() => setShareModalData(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              任何拥有此链接的人都可以查看此对话的当前快照。
            </p>

            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700">
              <input
                type="text"
                readOnly
                value={shareModalData.url}
                className="bg-transparent text-xs text-slate-700 dark:text-slate-300 w-full outline-hidden truncate font-mono"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(shareModalData.url);
                  setCopiedShare(true);
                  setTimeout(() => setCopiedShare(false), 2000);
                }}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium shrink-0 flex items-center gap-1 shadow-2xs transition-all active:scale-95"
              >
                {copiedShare ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>已复制</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>复制</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <a
                href={shareModalData.url}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-medium transition-all"
              >
                在新标签页中打开预览
              </a>
              <button
                onClick={() => setShareModalData(null)}
                className="px-4 py-2 bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 text-white rounded-xl text-xs font-medium shadow-2xs transition-all"
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
