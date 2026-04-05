import { useState, useCallback, useRef } from 'react';

/* ═══════════════ TYPES ═══════════════ */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface RepoTab {
  id: string;
  tabType: 'repo' | 'analyzer';
  repoUrl: string;
  repoName: string;
  owner: string;
  data: any | null;
  isLoading: boolean;
  isError: boolean;
  error: string | null;
  chatMessages: ChatMessage[];
  chatOpen: boolean;
  chatExpanded: boolean;
  loadingMessage?: string;
}

/* ═══════════════ HOOK ═══════════════ */
export function useTabStore() {
  const [tabs, setTabs] = useState<RepoTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const nextIdRef = useRef(1);

  const activeTab = tabs.find(t => t.id === activeTabId) || null;

  /**
   * Add a repo tab and immediately start loading.
   */
  const addTab = useCallback((repoUrl: string): string => {
    const id = `tab-${nextIdRef.current++}`;
    const parts = repoUrl.replace(/^https?:\/\/(www\.)?github\.com\//, '').replace(/\/$/, '').split('/');
    const owner = parts[0] || 'unknown';
    const repoName = parts[1] || 'repo';

    const newTab: RepoTab = {
      id,
      tabType: 'repo',
      repoUrl,
      repoName,
      owner,
      data: null,
      isLoading: true,
      isError: false,
      error: null,
      chatMessages: [],
      chatOpen: false,
      chatExpanded: false,
      loadingMessage: undefined,
    };

    setTabs(prev => [...prev, newTab]);
    setActiveTabId(id);
    return id;
  }, []);

  /**
   * Add a blank analyzer tab (no URL yet).
   * Returns the tab ID.
   */
  const addAnalyzerTab = useCallback((): string => {
    // Check if there's already an active analyzer tab — reuse it
    const existing = tabs.find(t => t.tabType === 'analyzer');
    if (existing) {
      setActiveTabId(existing.id);
      return existing.id;
    }

    const id = `tab-${nextIdRef.current++}`;
    const newTab: RepoTab = {
      id,
      tabType: 'analyzer',
      repoUrl: '',
      repoName: 'New Analysis',
      owner: '',
      data: null,
      isLoading: false,
      isError: false,
      error: null,
      chatMessages: [],
      chatOpen: false,
      chatExpanded: false,
      loadingMessage: undefined,
    };

    setTabs(prev => [...prev, newTab]);
    setActiveTabId(id);
    return id;
  }, [tabs]);

  /**
   * Convert an analyzer tab into a repo tab (when user submits a URL).
   */
  const convertAnalyzerToRepo = useCallback((tabId: string, repoUrl: string) => {
    const parts = repoUrl.replace(/^https?:\/\/(www\.)?github\.com\//, '').replace(/\/$/, '').split('/');
    const owner = parts[0] || 'unknown';
    const repoName = parts[1] || 'repo';

    setTabs(prev => prev.map(t =>
      t.id === tabId
        ? {
            ...t,
            tabType: 'repo' as const,
            repoUrl,
            repoName,
            owner,
            isLoading: true,
            isError: false,
            error: null,
            data: null,
            loadingMessage: undefined,
          }
        : t
    ));
  }, []);

  const closeTab = useCallback((tabId: string) => {
    setTabs(prev => {
      const newTabs = prev.filter(t => t.id !== tabId);
      if (tabId === activeTabId && newTabs.length > 0) {
        // Switch to previous tab (the one before the closed tab, or the last one)
        const closedIndex = prev.findIndex(t => t.id === tabId);
        const newIndex = Math.min(Math.max(closedIndex - 1, 0), newTabs.length - 1);
        setActiveTabId(newTabs[newIndex].id);
      } else if (newTabs.length === 0) {
        setActiveTabId(null);
      }
      return newTabs;
    });
  }, [activeTabId]);

  const switchTab = useCallback((tabId: string) => {
    setActiveTabId(tabId);
  }, []);

  const updateTabData = useCallback((tabId: string, data: any) => {
    setTabs(prev => prev.map(t => {
      if (t.id !== tabId) return t;
      const initialMessage: ChatMessage = {
        role: 'assistant',
        content: `Hello! I have analyzed **${data.metadata?.name || t.repoName}**. Ask me anything about its architecture, code, or dependencies.`
      };
      return {
        ...t,
        data,
        isLoading: false,
        isError: false,
        error: null,
        repoName: data.metadata?.name || t.repoName,
        owner: data.metadata?.owner || t.owner,
        chatMessages: [initialMessage],
      };
    }));
  }, []);

  const updateTabError = useCallback((tabId: string, error: string) => {
    setTabs(prev => prev.map(t =>
      t.id === tabId ? { ...t, isLoading: false, isError: true, error } : t
    ));
  }, []);

  const updateTabChat = useCallback((tabId: string, messages: ChatMessage[]) => {
    setTabs(prev => prev.map(t =>
      t.id === tabId ? { ...t, chatMessages: messages } : t
    ));
  }, []);

  const setChatOpen = useCallback((tabId: string, open: boolean) => {
    setTabs(prev => prev.map(t =>
      t.id === tabId ? { ...t, chatOpen: open } : t
    ));
  }, []);

  const setChatExpanded = useCallback((tabId: string, expanded: boolean) => {
    setTabs(prev => prev.map(t =>
      t.id === tabId ? { ...t, chatExpanded: expanded } : t
    ));
  }, []);

  const updateTabLoadingMessage = useCallback((tabId: string, msg: string) => {
    setTabs(prev => prev.map(t =>
      t.id === tabId ? { ...t, loadingMessage: msg } : t
    ));
  }, []);

  return {
    tabs,
    activeTab,
    activeTabId,
    addTab,
    addAnalyzerTab,
    convertAnalyzerToRepo,
    closeTab,
    switchTab,
    updateTabData,
    updateTabError,
    updateTabChat,
    setChatOpen,
    setChatExpanded,
    updateTabLoadingMessage,
  };
}
