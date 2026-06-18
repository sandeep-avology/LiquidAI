import { useState, useRef, useCallback, useEffect } from 'react'
import Sidebar from '../components/Sidebar'
import TopBar from '../components/TopBar'
import ChatArea from '../components/ChatArea'
import CodePanel from '../components/CodePanel'
import InputArea from '../components/InputArea'
import AnalysisOverlay from '../components/AnalysisOverlay'
import ApiSetupBanner from '../components/ApiSetupBanner'
import Toast from '../components/Toast'
import { fileToBase64, extractImageColors, copyCode, downloadCode, downloadAllFiles } from '../utils/helpers'
import { callChatAPI, authLogout, fetchVisionStatus } from '../utils/api'
import { formatErrorHtml } from '../utils/errors'

const EMPTY_CODE = { files: [], preview_html: '', format: 'html', _name: '' }

export default function MainApp({ user, onLogout, onOpenVFX }) {
  // ── sidebar ──
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false)

  // ── chat ──
  const [chatActive, setChatActive]     = useState(false)
  const [messages, setMessages]         = useState([])
  const [chatTitle, setChatTitle]       = useState('New Conversation')
  const [isLoading, setIsLoading]       = useState(false)
  const [loadingStatus, setLoadingStatus] = useState('')
  const chatHistoryRef  = useRef([])
  const messageCountRef = useRef(0)
  const chatAbortRef    = useRef(null)
  const lastImageRef    = useRef(null)

  // ── code panel ──
  const [codePanelOpen, setCodePanelOpen] = useState(false)
  const [activeFile, setActiveFile]       = useState('')
  const [currentCode, setCurrentCode]     = useState(EMPTY_CODE)

  // ── input / files ──
  const [attachedFiles, setAttachedFiles]   = useState([])
  const [pendingImageFile, setPendingImageFile] = useState(null)
  const [isFigmaMode, setIsFigmaMode]       = useState(false)
  const [isCodeMode, setIsCodeMode]         = useState(false)
  const [outputFormat, setOutputFormat]     = useState('html')

  // ── analysis overlay ──
  const [analysisOpen, setAnalysisOpen] = useState(false)

  // ── API / vision status ──
  const [visionHealth, setVisionHealth] = useState({
    serverReachable: true,
    visionEnabled: false,
    apiKeyConfigured: false,
    apiKeyStatus: 'missing',
  })
  const [bannerDismissed, setBannerDismissed] = useState(false)

  const refreshVisionStatus = useCallback(async () => {
    const status = await fetchVisionStatus()
    setVisionHealth(status)
    return status
  }, [])

  useEffect(() => {
    refreshVisionStatus()
  }, [refreshVisionStatus])

  // ── toast ──
  const [toastState, setToastState] = useState({ message: '', show: false })
  const toastTimer = useRef(null)

  const showToast = useCallback((msg, dur = 2000) => {
    clearTimeout(toastTimer.current)
    setToastState({ message: msg, show: true })
    toastTimer.current = setTimeout(() => setToastState(s => ({ ...s, show: false })), dur)
  }, [])

  const toggleTheme = useCallback(() => {
    const html = document.documentElement
    const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
    html.setAttribute('data-theme', next)
    showToast(next === 'dark' ? 'Dark mode' : 'Light mode')
  }, [showToast])

  const handleLogout = useCallback(async () => {
    await authLogout()
    localStorage.removeItem('liquidai_token')
    localStorage.removeItem('liquidai_user')
    onLogout()
  }, [onLogout])

  // ── file handling ──
  const addFile = useCallback(file => {
    setAttachedFiles(prev => prev.find(f => f.name === file.name) ? prev : [...prev, file])
    if (file.type?.startsWith('image/')) {
      setPendingImageFile(file)
      // New image upload = fresh request; clear prior design context
      lastImageRef.current = file.name + '-' + file.size + '-' + file.lastModified
      chatHistoryRef.current = []
    }
  }, [])

  const removeFile = useCallback(name => {
    setAttachedFiles(prev => {
      const next = prev.filter(f => f.name !== name)
      if (!next.some(f => f.type?.startsWith('image/'))) setPendingImageFile(null)
      return next
    })
  }, [])

  // ── new chat ──
  const newChat = useCallback(() => {
    chatAbortRef.current?.abort()
    chatAbortRef.current = null
    setChatActive(false); setMessages([])
    setChatTitle('New Conversation')
    setAttachedFiles([]); setPendingImageFile(null)
    setCurrentCode(EMPTY_CODE); setCodePanelOpen(false)
    setActiveFile(''); setIsLoading(false); setLoadingStatus('')
    chatHistoryRef.current = []; messageCountRef.current = 0
    setSidebarMobileOpen(false)
  }, [])

  // ── apply code response ──
  const applyCodeResponse = useCallback(data => {
    const files  = data.files || []
    const first  = files[0]?.name || ''
    const code   = { files, preview_html: data.preview_html || '', format: data.format || outputFormat, _name: data.section_name || 'section' }

    setCurrentCode(code)
    setActiveFile(first)
    setChatTitle(data.title || data.section_name || 'Generated Code')

    const formatLabel = { html:'HTML + CSS', 'html-js':'HTML + CSS + JS', shopify:'Shopify Liquid', react:'React Component', vue:'Vue Component' }[data.format] || 'HTML + CSS'
    const fileList = files.map(f => `<code>${f.name}</code>`).join(', ')

    setMessages(prev => [...prev, {
      id:   'assistant-' + Date.now(),
      role: 'assistant',
      text: data.message ||
        `<p>Generated <strong>${data.title || data.section_name}</strong> as <em>${formatLabel}</em>.</p>
         <p>${data.description || ''}</p>
         <p>Files ready: ${fileList}</p>`,
      code: { files, name: first },
    }])

    chatHistoryRef.current.push({ role: 'assistant', content: data.message || '' })
    setCodePanelOpen(true)
    // Show preview tab if available, else first file
    const previewExists = data.preview_html
    setActiveFile(previewExists ? '__preview__' : first)
  }, [outputFormat])

  // ── send message ──
  const sendMessage = useCallback(async (text, files, format) => {
    if (!text && files.length === 0) return
    const fmt = format || outputFormat
    const imageFile = files.find(f => f.type?.startsWith('image/'))

    setChatActive(true)
    messageCountRef.current++
    if (messageCountRef.current === 1 && text) {
      setChatTitle(text.length > 40 ? text.slice(0, 38) + '…' : text)
    }

    setMessages(prev => [...prev, { id: 'user-' + Date.now(), role: 'user', text, files }])
    if (text && !imageFile) chatHistoryRef.current.push({ role: 'user', content: [{ type: 'text', text }] })

    setIsLoading(true)
    setLoadingStatus(imageFile ? 'Step 1/2: Analyzing screenshot with AI vision…' : 'Generating code…')

    try {
      let imageBase64 = null, mediaType = null, colorPalette = null
      if (imageFile) {
        const [b64result, colors] = await Promise.all([
          fileToBase64(imageFile),
          extractImageColors(imageFile),
        ])
        imageBase64  = b64result.base64
        mediaType    = b64result.mediaType
        colorPalette = colors
        // Ensure no prior conversation bleeds into image generation
        chatHistoryRef.current = []
      }

      const fileCtx = files.filter(f => !f.type?.startsWith('image/')).map(f => `[Attached: ${f.name}]`).join('\n')
      const fullMsg = [fileCtx, text].filter(Boolean).join('\n\n')

      chatAbortRef.current = new AbortController()
      const data = await callChatAPI({
        message: fullMsg, imageBase64, mediaType, format: fmt, colorPalette,
        history: imageFile ? [] : chatHistoryRef.current.slice(-10),
        signal:  chatAbortRef.current.signal,
        onStatus: setLoadingStatus,
      })

      setIsLoading(false); setLoadingStatus('')

      if (imageFile) {
        setAttachedFiles(prev => prev.filter(f => !f.type?.startsWith('image/')))
        setPendingImageFile(null)
      }

      if (data.type === 'code') {
        applyCodeResponse(data)
      } else {
        setMessages(prev => [...prev, {
          id: 'assistant-' + Date.now(), role: 'assistant',
          text: data.message || data.text || '', code: null,
        }])
        chatHistoryRef.current.push({ role: 'assistant', content: data.message || '' })
      }
    } catch (err) {
      setIsLoading(false); setLoadingStatus('')
      if (err.name === 'AbortError') return
      if (err.message === 'SESSION_EXPIRED') { handleLogout(); return }
      setMessages(prev => [...prev, {
        id: 'err-' + Date.now(), role: 'assistant',
        text: `<div style="background:rgba(255,80,80,0.08);border:1px solid rgba(255,80,80,0.3);border-radius:10px;padding:14px 16px;font-size:13px">${formatErrorHtml(err.message, visionHealth)}</div>`,
        code: null,
      }])
    }
  }, [outputFormat, applyCodeResponse, handleLogout, visionHealth, refreshVisionStatus, showToast])

  const quickAction = useCallback(prompt => sendMessage(prompt, [], outputFormat), [sendMessage, outputFormat])

  const openAnalysisOverlay = useCallback(async () => {
    const img = pendingImageFile || attachedFiles.find(f => f.type?.startsWith('image/'))
    if (!img) { showToast('Attach an image first'); return }
    setPendingImageFile(img)
    setAnalysisOpen(true)
  }, [pendingImageFile, attachedFiles, showToast])

  const handleAnalysisComplete = useCallback(data => {
    setChatActive(true)
    messageCountRef.current++
    applyCodeResponse(data)
    setAttachedFiles(prev => prev.filter(f => !f.type?.startsWith('image/')))
    setPendingImageFile(null)
    setAnalysisOpen(false)
  }, [applyCodeResponse])

  return (
    <div className="app-shell">
      <Sidebar
        collapsed={sidebarCollapsed}
        mobileOpen={sidebarMobileOpen}
        onToggleCollapse={() => setSidebarCollapsed(c => !c)}
        onCloseMobile={() => setSidebarMobileOpen(false)}
        onNewChat={newChat}
        onQuickAction={quickAction}
        onLoadChat={title => { setChatTitle(title); setSidebarMobileOpen(false); showToast('Chat loaded') }}
        onToggleTheme={toggleTheme}
        user={user}
        onLogout={handleLogout}
        onOpenVFX={onOpenVFX}
      />

      <main className="main-content">
        <TopBar
          title={chatTitle}
          codePanelOpen={codePanelOpen}
          onToggleCodePanel={() => setCodePanelOpen(o => !o)}
          onMobileMenu={() => setSidebarMobileOpen(o => !o)}
          user={user}
          onLogout={handleLogout}
        />

        {!bannerDismissed && (
          <ApiSetupBanner
            serverReachable={visionHealth.serverReachable}
            apiKeyConfigured={visionHealth.apiKeyConfigured}
            apiKeyStatus={visionHealth.apiKeyStatus}
            quotaExhausted={visionHealth.quotaExhausted}
            quotaResetsAt={visionHealth.quotaResetsAt}
            onDismiss={() => setBannerDismissed(true)}
            onKeySaved={() => {
              refreshVisionStatus()
              showToast('API key saved — AI Vision is now active')
              setBannerDismissed(true)
            }}
          />
        )}

        <div className="content-split">
          <div className="chat-area">
            <ChatArea
              chatActive={chatActive}
              messages={messages}
              isLoading={isLoading}
              loadingStatus={loadingStatus}
              currentCode={currentCode}
              onQuickAction={quickAction}
              onShowToast={showToast}
              onOpenCodePanel={() => { setCodePanelOpen(true); setActiveFile(currentCode.files?.[0]?.name || '') }}
              onDownload={() => downloadCode(currentCode, activeFile, showToast)}
            />
          </div>

          <CodePanel
            open={codePanelOpen}
            activeFile={activeFile}
            currentCode={currentCode}
            onFileChange={setActiveFile}
            onClose={() => setCodePanelOpen(false)}
            onCopy={() => copyCode(currentCode, activeFile, showToast)}
            onDownload={() => downloadCode(currentCode, activeFile, showToast)}
            onDownloadAll={() => downloadAllFiles(currentCode, showToast)}
          />
        </div>

        <InputArea
          attachedFiles={attachedFiles}
          pendingImageFile={pendingImageFile}
          isFigmaMode={isFigmaMode}
          isCodeMode={isCodeMode}
          isLoading={isLoading}
          outputFormat={outputFormat}
          onFormatChange={setOutputFormat}
          onSend={sendMessage}
          onAddFile={addFile}
          onRemoveFile={removeFile}
          onToggleFigma={() => setIsFigmaMode(m => !m)}
          onToggleCode={() => setIsCodeMode(m => !m)}
          onOpenAnalysis={openAnalysisOverlay}
          onShowToast={showToast}
        />
      </main>

      {analysisOpen && (
        <AnalysisOverlay
          imageFile={pendingImageFile}
          outputFormat={outputFormat}
          onClose={() => setAnalysisOpen(false)}
          onComplete={handleAnalysisComplete}
          onSwitchToFile={setActiveFile}
          onShowToast={showToast}
        />
      )}

      <Toast message={toastState.message} show={toastState.show} />
    </div>
  )
}
