import React, { useState, useEffect } from 'react';
import { adminApi } from '../../api/client.js';
import { MediaUpload } from '../../types/index.js';
import {
  Image as ImageIcon,
  Search,
  RotateCw,
  Trash2,
  Download,
  Copy,
  Check,
  Eye,
  LayoutGrid,
  List,
  HardDrive,
  Calendar,
  User,
  X,
} from 'lucide-react';

export const MediaTab: React.FC = () => {
  const [mediaList, setMediaList] = useState<MediaUpload[]>([]);
  const [total, setTotal] = useState(0);
  const [totalSizeBytes, setTotalSizeBytes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 24;

  // Filters & View mode
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Preview Lightbox Modal
  const [selectedMedia, setSelectedMedia] = useState<MediaUpload | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchMedia = async () => {
    setLoading(true);
    try {
      const res = await adminApi.getMediaLogs({
        search,
        startDate,
        endDate,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      setMediaList(res.items || []);
      setTotal(res.total || 0);
      setTotalSizeBytes(res.total_size_bytes || 0);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMedia();
  }, [page, startDate, endDate]);

  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm('确定要删除这张图片记录及物理文件吗？')) return;
    try {
      await adminApi.deleteMedia(id);
      if (selectedMedia?.id === id) setSelectedMedia(null);
      fetchMedia();
    } catch (err: any) {
      alert(err.message || '删除失败');
    }
  };

  const handleCopyPrompt = (promptText?: string) => {
    if (!promptText) return;
    navigator.clipboard.writeText(promptText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const totalPages = Math.ceil(total / pageSize) || 1;

  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      {/* Top Header & Storage Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <span>图片与多媒体日志 (Image Logs)</span>
          </h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            查看 AI 生成的画作历史、用户上传的图片与文档，支持在线预览与物理清理
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Storage Stat Pill */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-300">
            <HardDrive className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
            <span>
              已存 <strong>{total}</strong> 张 ({formatFileSize(totalSizeBytes)})
            </span>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-xl text-xs">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-slate-700 text-purple-600 dark:text-purple-400 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
              }`}
              title="画廊网格视图"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === 'table'
                  ? 'bg-white dark:bg-slate-700 text-purple-600 dark:text-purple-400 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
              }`}
              title="列表视图"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={fetchMedia}
            disabled={loading}
            className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl transition-all active:scale-95 disabled:opacity-50 border border-slate-200/60 dark:border-slate-700"
            title="刷新"
          >
            <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin text-purple-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="搜索提示词、文件名或用户名..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') fetchMedia();
            }}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 outline-hidden focus:border-purple-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 outline-hidden"
            title="开始日期"
          />
          <span className="text-slate-400 text-xs">-</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 outline-hidden"
            title="结束日期"
          />
          {(search || startDate || endDate) && (
            <button
              onClick={() => {
                setSearch('');
                setStartDate('');
                setEndDate('');
                setPage(1);
              }}
              className="px-3 py-1.5 text-xs text-purple-600 dark:text-purple-400 font-medium hover:underline"
            >
              清空
            </button>
          )}
        </div>
      </div>

      {/* Media Display: Grid View */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
          {mediaList.length === 0 ? (
            <div className="col-span-full py-16 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs text-slate-400">
              {loading ? '正在加载图片...' : '暂无符合条件的图片日志'}
            </div>
          ) : (
            mediaList.map((media) => {
              const fileUrl = `/uploads/${media.file_path || media.file_name}`;
              return (
                <div
                  key={media.id}
                  onClick={() => setSelectedMedia(media)}
                  className="group relative bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col"
                >
                  {/* Thumbnail */}
                  <div className="aspect-square bg-slate-100 dark:bg-slate-800 overflow-hidden relative">
                    <img
                      src={fileUrl}
                      alt={media.extracted_text || media.file_name}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                    {/* Hover Overlay Buttons */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedMedia(media);
                        }}
                        className="p-2 bg-white/90 hover:bg-white text-slate-800 rounded-full shadow-md transition-all"
                        title="查看大图"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => handleDelete(media.id, e)}
                        className="p-2 bg-red-600/90 hover:bg-red-600 text-white rounded-full shadow-md transition-all"
                        title="删除图片"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Info Card Footer */}
                  <div className="p-2.5 space-y-1 flex-1 flex flex-col justify-between">
                    <div className="text-[11px] font-medium text-slate-800 dark:text-slate-200 truncate line-clamp-1" title={media.extracted_text || media.file_name}>
                      {media.extracted_text || media.file_name}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500">
                      <span>{media.username || '匿名'}</span>
                      <span>{formatFileSize(media.file_size)}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Media Display: Table View */}
      {viewMode === 'table' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50/90 dark:bg-slate-800/90 border-b border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold select-none">
                <tr>
                  <th className="px-4 py-3">预览</th>
                  <th className="px-4 py-3">提示词 / 描述</th>
                  <th className="px-4 py-3">用户</th>
                  <th className="px-4 py-3">文件大小</th>
                  <th className="px-4 py-3">生成/上传时间</th>
                  <th className="px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {mediaList.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-slate-400 text-xs">
                      {loading ? '正在加载图片...' : '暂无符合条件的图片日志'}
                    </td>
                  </tr>
                ) : (
                  mediaList.map((media) => {
                    const fileUrl = `/uploads/${media.file_path || media.file_name}`;
                    return (
                      <tr
                        key={media.id}
                        onClick={() => setSelectedMedia(media)}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
                      >
                        <td className="px-4 py-2.5">
                          <img
                            src={fileUrl}
                            alt=""
                            className="w-10 h-10 rounded-lg object-cover border border-slate-200 dark:border-slate-700"
                          />
                        </td>
                        <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-200 max-w-xs truncate">
                          {media.extracted_text || media.file_name}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">
                          {media.username || '匿名'}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[11px]">
                          {formatFileSize(media.file_size)}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[11px] text-slate-500">
                          {new Date(media.created_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <a
                              href={fileUrl}
                              download={media.file_name}
                              onClick={(e) => e.stopPropagation()}
                              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 rounded-lg transition-colors"
                              title="下载原图"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </a>
                            <button
                              onClick={(e) => handleDelete(media.id, e)}
                              className="p-1.5 hover:bg-red-50 text-red-600 rounded-lg transition-colors"
                              title="删除"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination Bar */}
      <div className="p-3.5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <div>
          显示第 {(page - 1) * pageSize + 1} 至 {Math.min(page * pageSize, total)} 条，共 {total} 张图片
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
            className="px-3 py-1 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors"
          >
            上一页
          </button>
          <span className="px-2 font-mono">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            className="px-3 py-1 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors"
          >
            下一页
          </button>
        </div>
      </div>

      {/* Fullscreen Lightbox Modal */}
      {selectedMedia && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in"
          onClick={() => setSelectedMedia(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-hidden border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-purple-600" />
                <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  图片详细视图
                </span>
              </div>
              <button
                onClick={() => setSelectedMedia(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Image Preview Container */}
            <div className="bg-slate-950 flex items-center justify-center p-4 min-h-[300px] max-h-[55vh] overflow-hidden">
              <img
                src={`/uploads/${selectedMedia.file_path || selectedMedia.file_name}`}
                alt=""
                className="max-h-[50vh] max-w-full object-contain rounded-lg shadow-lg"
              />
            </div>

            {/* Meta & Prompt Footer */}
            <div className="p-5 space-y-3 bg-white dark:bg-slate-900">
              {selectedMedia.extracted_text && (
                <div className="p-3 bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200/80 dark:border-purple-900/60 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-xs font-semibold text-purple-800 dark:text-purple-300">
                    <span>生成提示词 (Prompt)</span>
                    <button
                      onClick={() => handleCopyPrompt(selectedMedia.extracted_text)}
                      className="flex items-center gap-1 hover:underline text-[11px]"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? '已复制' : '复制提示词'}</span>
                    </button>
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed max-h-24 overflow-y-auto">
                    {selectedMedia.extracted_text}
                  </p>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 pt-1">
                <div className="flex items-center gap-4">
                  <span>用户: <strong>{selectedMedia.username || '匿名'}</strong></span>
                  <span>文件大小: <strong>{formatFileSize(selectedMedia.file_size)}</strong></span>
                  <span>时间: {new Date(selectedMedia.created_at).toLocaleString()}</span>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={`/uploads/${selectedMedia.file_path || selectedMedia.file_name}`}
                    download={selectedMedia.file_name}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-medium transition-all"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>下载原图</span>
                  </a>
                  <button
                    onClick={() => handleDelete(selectedMedia.id)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/60 text-red-600 dark:text-red-300 rounded-xl font-medium transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>删除图片</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
