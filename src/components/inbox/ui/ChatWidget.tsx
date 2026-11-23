"use client";
import { FormattedText } from "./FormattedText";
import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import {
    ArrowUp,
    RotateCcw,
} from "lucide-react";
import { ReplyContactForm } from "@/components/customer-messenger/ui/ReplyContactForm";
import type { MessengerBrand, PublicMessengerSettings } from "@/components/customer-messenger/types";
import { ChatHeader, HomeNav } from "@/components/customer-messenger/ui/ChatChrome";
import { CustomerMessage, StaffMessage, customerBubbleClass, messageTime } from "@/components/customer-messenger/ui/ChatMessage";
import type { ReplyContactDraft } from "@/lib/customer-messenger/rules";
import { MessengerHome, responseStatus } from "@/components/customer-messenger/ui/MessengerHome";
import { inboxRequest, InboxRequestError } from "../api";
import type { SendbCustomerMessages } from "../../../../sdk/messenger";
import { useAttachmentDrafts } from "../hooks/useAttachmentDrafts";
import { useVisibleMessageReceipts } from "../hooks/useVisibleMessageReceipts";
import { AttachmentDrafts, AttachmentPicker } from "./AttachmentDrafts";
import { AttachmentList } from "./AttachmentList";
import { draftSessionKey } from "../utils/session";
import { useJourneyAttachment } from "@/components/inbox-journey/hooks/useJourneyAttachment";
import { useCustomerConversations } from "@/components/customer-conversations/hooks/useCustomerConversations";
import { CustomerConversationList } from "@/components/customer-conversations/ui/CustomerConversationList";
import { VisitorThreadList } from "@/components/customer-conversations/ui/VisitorThreadList";
import { useVisitorThreads } from "@/components/customer-conversations/hooks/useVisitorThreads";
import {
    customerConversationTimestamp,
    isReadOnlyCustomerConversation,
} from "@/components/customer-conversations/utils/presentation";
import { mergeCustomerDraftText } from "@/components/customer-conversations/utils/draft-text";
import { useAsyncConfirm } from "@/components/ui/alert-dialog";
import { isWidgetAccessDenied } from "../utils/widget-errors";
type PendingMessage = { body: string; id: string; files: string };
type ConversationDraft = {
    text: string;
    suggestion: string;
    pending: PendingMessage | null;
    handoff: string | null;
};
type VisitorDetail = SendbCustomerMessages;
type CustomerMessage = VisitorDetail["messages"][number];
const conversationUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function ChatWidget({
    channelKey,
    parentOrigin,
    pageUrl,
    brand,
}: {
    channelKey: string;
    parentOrigin?: string;
    pageUrl?: string;
    brand?: MessengerBrand;
}) {
    const ownerOrigin = useCallback(
        () =>
            parentOrigin ||
            new URLSearchParams(window.location.search).get("origin"),
        [parentOrigin],
    );
    const [isHome, setIsHome] = useState(true);
    // 비회원: 대화 메뉴의 진행 중 대화 목록
    const [threadList, setThreadList] = useState(false);
    // 헤더 오른쪽 "나가기" — 확인창을 띄우고, 나가면 상담을 종료하고 홈으로
    const [leaveOpen, setLeaveOpen] = useState(false);
    const [leaving, setLeaving] = useState(false);
    const { confirm, confirmationDialog } = useAsyncConfirm();
    const [token, setToken] = useState(""),
        [ready, setReady] = useState(false),
        [name, setName] = useState(""),
        [email, setEmail] = useState("");
    const [text, setText] = useState(""),
        [busy, setBusy] = useState(false),
        [error, setError] = useState("");
    // 보내는 중인 메시지 — 서버 응답을 기다리지 않고 바로 말풍선으로 보여준다
    const [outgoing, setOutgoing] = useState<{ id: string; body: string } | null>(null);
    const [suggestedText, setSuggestedText] = useState("");
    const deferredDraft = useRef<string | null>(null);
    const [hasDeferredDraft, setHasDeferredDraft] = useState(false);
    const incomingDraft = useRef<(message: string) => void>(() => {});
    const textRef = useRef(text);
    useEffect(() => {
        textRef.current = text;
    }, [text]);
    const [older, setOlder] = useState<CustomerMessage[]>([]),
        [canLoad, setCanLoad] = useState(true);
    const [blocked, setBlocked] = useState(false);
    const [linking, setLinking] = useState(false);
    const [managed, setManaged] = useState(false),
        [opened, setOpened] = useState(true),
        [readId, setReadId] = useState(0);
    const generation = useRef(0);
    const [draftKey, setDraftKey] = useState("current");
    const drafts = useRef(new Map<string, ConversationDraft>());
    const [configuration, setConfiguration] = useState<{
        nonce: number;
        id?: number;
        token: string;
    } | null>(null);
    const configurationNonce = useRef(0);
    const configurationId = useRef<number | undefined>(undefined);
    const acknowledgedConfiguration = useRef(0);
    const loadedOrigin = useRef("");
    const navigation = useRef<(view: string, id?: string) => void>(() => {});
    const openLatest = useRef<(conversationId?: unknown) => void>(() => {});
    const history = useCustomerConversations(channelKey, token, ready, opened);
    const markSeen = history.markSeen;
    const invalidateConversation = history.invalidate;
    const openConversation = history.open;
    const startInquiry = history.newInquiry;
    const isList = history.enabled && history.view === "list";
    const isNew = history.enabled && history.view === "new";
    const selectedId = history.enabled ? history.conversationId : undefined;
    const baseUrl = `/api/messenger/${channelKey}`;
    const selectedUrl = selectedId
        ? `${baseUrl}?conversationId=${encodeURIComponent(selectedId)}`
        : baseUrl;
    const handoffPending = useRef<string | null>(null);
    const replyContactDraft = useRef<{
        token: string;
        key: string;
        draft: ReplyContactDraft;
    } | null>(null);
    const [contactSeed, setContactSeed] = useState<{
        id: string;
        draft: ReplyContactDraft;
    } | null>(null);
    /** 방문 고객 세션을 비운다 — 다음 메시지는 새 상담으로 시작한다 ("새 문의 시작"·"나가기") */
    function resetVisitorSession() {
        generation.current++;
        attachments.reset();
        drafts.current.clear();
        deferredDraft.current = null;
        setHasDeferredDraft(false);
        setDraftKey("current");
        pending.current = null;
        handoffPending.current = null;
        setText("");
        setSuggestedText("");
        setToken("");
        setOlder([]);
        setCanLoad(true);
        if (managed) parentMessage("sendb:session", { token: "" });
        try {
            localStorage.removeItem(storageKey);
        } catch {}
    }
    /** 비회원 대화 목록에서 다른 대화로 옮긴다 */
    function openVisitorThread(next: string) {
        resetVisitorSession();
        setToken(next);
        if (managed) parentMessage("sendb:session", { token: next });
        try {
            localStorage.setItem(storageKey, next);
        } catch {}
        setThreadList(false);
        setIsHome(false);
    }
    async function ensureSession(currentGeneration: number) {
        if (token) return token;
        const result = await inboxRequest<{ token: string }>(baseUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: "session",
                name: name.trim() || "방문 고객",
                email: email.trim(),
                pageUrl: pageUrl || undefined,
            }),
        });
        if (currentGeneration !== generation.current) return "";
        configured.current = draftSessionKey(result.token);
        setToken(result.token);
        if (managed) parentMessage("sendb:session", { token: result.token });
        else
            try {
                localStorage.setItem(storageKey, result.token);
            } catch {}
        return result.token;
    }
    function contactSnapshot() {
        const c = replyContactDraft.current;
        return c?.token === token && c.key === draftKey ? c.draft : null;
    }
    async function savePendingContact(
        session: string,
        id: string | undefined,
        snapshot: ReplyContactDraft | null,
    ) {
        if (!snapshot) return;
        try {
            await inboxRequest(
                `${baseUrl}/contact${id ? `?conversationId=${encodeURIComponent(id)}` : ""}`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${session}`,
                    },
                    body: JSON.stringify(snapshot),
                },
            );
            setContactSeed(null);
            replyContactDraft.current = null;
        } catch {
            if (id) setContactSeed({ id, draft: snapshot });
            setError(
                "문의는 접수됐지만 연락처 저장을 확인하지 못했습니다. 연락처를 확인하고 다시 저장해주세요.",
            );
        }
    }
    async function requestHuman() {
        if (busy || linking || inquiryPending || !canWrite) return;
        if (isNew && pending.current) {
            setError(
                "먼저 작성한 메시지를 다시 보내 결과를 확인해주세요. 작성 내용은 보관되어 있습니다.",
            );
            return;
        }
        const currentGeneration = generation.current;
        setBusy(true);
        setError("");
        handoffPending.current ??= crypto.randomUUID();
        const snapshot = contactSnapshot();
        try {
            const session = await ensureSession(currentGeneration);
            if (!session || currentGeneration !== generation.current) return;
            const result = await inboxRequest<{ conversationId?: string }>(
                isNew ? `${baseUrl}/conversations` : selectedUrl,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${session}`,
                    },
                    body: JSON.stringify({
                        clientId: handoffPending.current,
                        body: "상담원 연결을 부탁드립니다.",
                    }),
                },
            );
            if (currentGeneration !== generation.current) return;
            await savePendingContact(
                session,
                result.conversationId ?? selectedId,
                snapshot,
            );
            handoffPending.current = null;
            if (isNew && result.conversationId) {
                attachments.moveTo(`${channelKey}:${result.conversationId}`);
                drafts.current.delete("new");
                setDraftKey(result.conversationId);
                history.open(result.conversationId);
            } else await data.mutate();
            void history.refresh();
        } catch (e) {
            if (currentGeneration === generation.current)
                setError((e as Error).message);
        } finally {
            if (currentGeneration === generation.current) setBusy(false);
        }
    }
    const attachments = useAttachmentDrafts(`${channelKey}:${draftKey}`);
    const [dragging, setDragging] = useState(false);
    const moveAttachments = useRef(attachments.moveTo);
    moveAttachments.current = attachments.moveTo;
    const resetAttachments = attachments.reset;
    const uploadUrl = `${baseUrl}/attachments${isNew ? "?newConversation=1" : selectedId ? `?conversationId=${encodeURIComponent(selectedId)}` : ""}`;
    const configured = useRef<string | null>(null);
    const [journeyToken, setJourneyToken] = useState<string | undefined>(
        undefined,
    );
    const pending = useRef<PendingMessage | null>(null),
        end = useRef<HTMLDivElement>(null),
        scroll = useRef<HTMLDivElement>(null),
        follow = useRef(true);
    const storageKey = `sendb-chat:${channelKey}`;
    // 답변 알림 링크의 열쇠 (처음 한 번만 주소에서 읽고 지운다)
    const resumeParam = useRef<string | null | undefined>(undefined);
    const threads = useVisitorThreads(storageKey, baseUrl, !history.enabled);
    // 이 브라우저가 연 비회원 대화를 목록에 기억한다
    useEffect(() => {
        if (token && !token.includes(".")) threads.add(token);
    }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
    const config = useSWR<{
        name: string;
        greeting: string;
        messengerSettings?: PublicMessengerSettings;
        color: string;
        allowedOrigins: string[];
        businessHours?: {
            open: boolean;
            nextOpenAt: string | null;
            timezone: string;
            awayMessage: string;
        } | null;
    }>(`/api/messenger/${channelKey}`, inboxRequest, {
        refreshInterval: 60000,
        refreshWhenHidden: false,
    });
    const detailPollInterval = useCallback(
        (latest?: VisitorDetail) => !opened ? 15000 : latest?.aiTyping ? 1000 : 3000,
        [opened],
    );
    const data = useSWR<
        VisitorDetail & { configurationNonce: number; sessionToken: string }
    >(
        token && ready && !linking
            ? [selectedUrl, token, configuration?.nonce ?? 0]
            : null,
        async ([url, value, nonce]: [string, string, number]) => ({
            ...(await inboxRequest<VisitorDetail>(url, {
                headers: { Authorization: `Bearer ${value}` },
            })),
            configurationNonce: nonce,
            sessionToken: value,
        }),
        {
            // AI가 답을 쓰는 중이면 더 자주 확인해 답이 바로 보이게 한다
            refreshInterval: detailPollInterval,
            refreshWhenHidden: false,
            shouldRetryOnError: (error) => !isWidgetAccessDenied(error),
        },
    );
    const currentResolved =
        data.data?.sessionToken === token &&
        data.data?.configurationNonce === (configuration?.nonce ?? 0);
    const detailAccessDenied = isWidgetAccessDenied(data.error);
    const detailResolved =
        currentResolved &&
        !detailAccessDenied &&
        (!selectedId || data.data?.conversationId === selectedId);
    const selectedRow = history.rows.find((row) => row.id === selectedId);
    const readOnly =
        !isNew &&
        (isReadOnlyCustomerConversation(selectedRow) ||
            (detailResolved && isReadOnlyCustomerConversation(data.data)));
    const detailPending = history.enabled && !isNew && !detailResolved;
    const canWrite = !readOnly && !detailPending && !detailAccessDenied;
    useJourneyAttachment({
        channelKey,
        token,
        journeyToken,
        conversationId: detailResolved ? data.data?.conversationId : undefined,
        readOnly,
        ready: ready && !linking && !isNew && !isList && detailResolved,
    });
    const inquiryPending =
        history.enabled && history.view === "current" && !currentResolved;
    const navigationBusy = busy || linking || inquiryPending;
    incomingDraft.current = (message: string) => {
        setIsHome(false);
        if (
            history.enabled &&
            (readOnly || detailPending || linking || isList || busy)
        ) {
            deferredDraft.current = message;
            setHasDeferredDraft(true);
            return;
        }
        const next = mergeCustomerDraftText(
            textRef.current,
            suggestedText,
            message,
        );
        setText(next.text);
        setSuggestedText(next.suggestion);
    };
    useEffect(() => {
        if (history.enabled && detailAccessDenied && selectedId)
            invalidateConversation(selectedId);
    }, [
        history.enabled,
        detailAccessDenied,
        selectedId,
        invalidateConversation,
    ]);
    useEffect(() => {
        generation.current++;
        configured.current = null;
        drafts.current.clear();
        deferredDraft.current = null;
        setHasDeferredDraft(false);
        resetAttachments();
        pending.current = null;
        handoffPending.current = null;
        setDraftKey("current");
        setText("");
        setSuggestedText("");
        setOlder([]);
        setCanLoad(true);
        setBusy(false);
        setManaged(false);
        setIsHome(true);
        setConfiguration(null);
        // 답변 알림 링크(?resume=열쇠)로 열면 그 상담을 바로 보여준다 — 다른 기기에서도 지난 대화를 볼 수 있다
        if (resumeParam.current === undefined) {
            const url = new URL(window.location.href);
            const value = window.parent === window ? url.searchParams.get("resume") : null;
            resumeParam.current = value && /^[a-f0-9]{64}$/.test(value) ? value : null;
            if (value) {
                url.searchParams.delete("resume");
                window.history.replaceState(null, "", url.href);
            }
        }
        const resume = resumeParam.current;
        if (resume) {
            setToken(resume);
            setIsHome(false);
            try {
                localStorage.setItem(storageKey, resume);
            } catch {}
        } else
            try {
                setToken(localStorage.getItem(storageKey) ?? "");
            } catch {
                /* 저장이 제한되어도 현재 창에서는 상담 가능 */
            }
        setReady(true);
    }, [storageKey, resetAttachments]);
    useEffect(() => {
        if (!config.data || window.parent === window) return;
        const parent = ownerOrigin();
        if (!parent || !config.data.allowedOrigins.includes(parent))
            setBlocked(true);
        if (!parent || !config.data.allowedOrigins.includes(parent)) return;
        const listener = (event: MessageEvent) => {
            if (
                event.source !== window.parent ||
                event.origin !== parent ||
                event.data?.key !== channelKey
            )
                return;
            if (event.data.type === "sendb:configure") {
                setJourneyToken(
                    typeof event.data.journeyToken === "string"
                        ? event.data.journeyToken
                        : undefined,
                );
                if (
                    event.data.configurationId !== undefined &&
                    (!Number.isSafeInteger(event.data.configurationId) ||
                        event.data.configurationId < 1)
                )
                    return;
                const next =
                    typeof event.data.identityToken === "string"
                        ? event.data.identityToken
                        : typeof event.data.visitorToken === "string"
                          ? event.data.visitorToken
                          : "";
                setManaged(true);
                setLinking(false);
                setToken(next);
                setOpened(!!event.data.opened);
                setReadId(Number(event.data.readId) || 0);
                configurationId.current = event.data.configurationId;
                setConfiguration({
                    nonce: ++configurationNonce.current,
                    id: event.data.configurationId,
                    token: next,
                });
                const session = draftSessionKey(next);
                if (configured.current !== session) {
                    setIsHome(true);
                    generation.current++;
                    setBusy(false);
                    resetAttachments();
                    drafts.current.clear();
                    deferredDraft.current = null;
                    setHasDeferredDraft(false);
                    setDraftKey("current");
                    if (!event.data.continueAnonymous) setText("");
                    if (!event.data.continueAnonymous) setSuggestedText("");
                    setOlder([]);
                    setCanLoad(true);
                    setError("");
                    if (!event.data.continueAnonymous || pending.current?.files)
                        pending.current = null;
                    if (!event.data.continueAnonymous)
                        handoffPending.current = null;
                    configured.current = session;
                }
            }
            if (event.data.type === "sendb:visibility") {
                setOpened(!!event.data.opened);
            }
            // 사이트의 새 답변 말풍선을 눌렀을 때 — 그 상담을 바로 보여준다
            if (event.data.type === "sendb:open-latest") openLatest.current(event.data.conversationId);
            if (event.data.type === "sendb:journey-context")
                setJourneyToken(
                    typeof event.data.journeyToken === "string"
                        ? event.data.journeyToken
                        : undefined,
                );
            if (event.data.type === "sendb:linking")
                setLinking(!!event.data.linking);
            if (
                event.data.type === "sendb:navigate" &&
                event.data.configurationId === configurationId.current
            )
                navigation.current(event.data.view, event.data.conversationId);
            if (
                event.data.type === "sendb:draft" &&
                typeof event.data.message === "string" &&
                event.data.message.length <= 5000
            ) {
                incomingDraft.current(event.data.message);
            }
            if (event.data.type === "sendb:visitor-profile") {
                if (
                    typeof event.data.name === "string" &&
                    event.data.name.trim().length <= 100
                )
                    setName(event.data.name.trim());
                if (
                    typeof event.data.email === "string" &&
                    event.data.email.length <= 254
                )
                    setEmail(event.data.email);
            }
        };
        window.addEventListener("message", listener);
        if (loadedOrigin.current !== `${channelKey}:${parent}`) {
            loadedOrigin.current = `${channelKey}:${parent}`;
            window.parent.postMessage(
                { type: "sendb:loaded", key: channelKey },
                parent,
            );
        }
        return () => window.removeEventListener("message", listener);
    }, [config.data, channelKey, resetAttachments, ownerOrigin]);
    const parentMessage = useCallback(
        (type: string, payload: Record<string, unknown> = {}) => {
            if (!managed || window.parent === window) return;
            const parent = ownerOrigin();
            if (parent && config.data?.allowedOrigins.includes(parent))
                window.parent.postMessage(
                    {
                        type,
                        key: channelKey,
                        configurationId: configurationId.current,
                        ...payload,
                    },
                    parent,
                );
        },
        [managed, config.data, channelKey, ownerOrigin],
    );
    useEffect(() => {
        if (
            !managed ||
            !configuration ||
            token !== configuration.token ||
            acknowledgedConfiguration.current === configuration.nonce
        )
            return;
        // A new key forces a fresh request even for the same token. Never acknowledge
        // a new identity/configuration using a cached response from the previous one.
        if (
            (!token && config.data) ||
            (data.data?.sessionToken === token &&
                data.data.configurationNonce === configuration.nonce)
        ) {
            acknowledgedConfiguration.current = configuration.nonce;
            // 사이트의 런처 버튼도 채널 브랜드 색을 따르도록 함께 알린다.
            parentMessage("sendb:ready", { configurationId: configuration.id, color: config.data?.color });
        } else if (data.error)
            parentMessage("sendb:error", {
                configurationId: configuration.id,
                message: data.error.message,
                status:
                    data.error instanceof InboxRequestError
                        ? data.error.status
                        : 500,
            });
    }, [
        managed,
        token,
        configuration,
        config.data,
        data.data,
        data.error,
        parentMessage,
    ]);
    const latestId = data.data?.messages.at(-1)?.id ?? 0;
    const baseError = config.error?.message;
    const viewingThread = detailResolved && opened && !isHome && !isList && !isNew &&
        !(threadList && !history.enabled) && !readOnly && !linking && !leaveOpen && !blocked && !baseError;
    useEffect(() => {
        const detail = data.data;
        if (!managed || !detail || !detailResolved || history.enabled || linking) return;
        const syncUnread = () => {
            const reading = viewingThread && document.visibilityState === "visible";
            const replies = reading ? [] : detail.messages.filter(m => m.kind === "reply" && m.id > readId);
            if (reading && latestId > readId) {
                setReadId(latestId);
                parentMessage("sendb:read", { readId: latestId });
            }
            const last = replies.at(-1);
            parentMessage("sendb:unread", {
                count: replies.length,
                latest: last ? {
                    id: `${detail.conversationId ?? ""}:${last.id}`,
                    name: last.authorName || config.data?.name || "",
                    body: last.body || "파일을 보냈어요",
                    at: last.createdAt,
                } : null,
            });
        };
        syncUnread();
        document.addEventListener("visibilitychange", syncUnread);
        return () => document.removeEventListener("visibilitychange", syncUnread);
    }, [
        managed,
        viewingThread,
        detailResolved,
        latestId,
        readId,
        data.data,
        history.enabled,
        linking,
        parentMessage,
        config.data?.name,
    ]);
    const unreadRow = history.rows.find((row) => row.unread > 0 && !row.readOnly);
    useEffect(() => {
        if (managed && history.enabled && history.unreadCount !== undefined)
            parentMessage("sendb:unread", {
                count: history.unreadCount,
                latest: unreadRow
                    ? {
                          id: `${unreadRow.id}:${unreadRow.lastMessageAt}`,
                          name: config.data?.name ?? "",
                          body: unreadRow.preview,
                          at: unreadRow.lastMessageAt,
                          conversationId: unreadRow.id,
                      }
                    : null,
            });
    }, [managed, history.enabled, history.unreadCount, parentMessage, unreadRow, config.data?.name]);
    // 사이트 상담 버튼의 색·인사 말풍선
    useEffect(() => {
        const settings = config.data?.messengerSettings;
        if (!managed || !settings) return;
        const status = responseStatus(settings, config.data?.businessHours);
        parentMessage("sendb:launcher", {
            color: config.data?.color,
            greeting: settings.launcherBubbleEnabled ? settings.launcherBubble : "",
            status: status.text,
            quick: status.quick,
        });
    }, [managed, config.data, parentMessage]);
    useEffect(() => {
        const id = data.data?.conversationId;
        if (!history.enabled || !viewingThread || !id || !latestId) return;
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const mark = () => {
            if (cancelled || document.visibilityState !== "visible") return;
            void markSeen(id, latestId, data.data?.readRevision).catch(() => {
                if (!cancelled) timer = setTimeout(mark, 5000);
            });
        };
        mark();
        document.addEventListener("visibilitychange", mark);
        return () => {
            cancelled = true;
            clearTimeout(timer);
            document.removeEventListener("visibilitychange", mark);
        };
    }, [
        history.enabled,
        markSeen,
        viewingThread,
        latestId,
        data.data?.conversationId,
        data.data?.readRevision,
    ]);
    useEffect(() => {
        if (
            !config.data?.messengerSettings?.emailNotifications ||
            !viewingThread ||
            !data.data?.conversationId ||
            !latestId ||
            !token
        )
            return;
        const id = data.data.conversationId;
        const seen = () => {
            if (document.visibilityState === "visible")
                void inboxRequest(
                    `${baseUrl}/contact?conversationId=${encodeURIComponent(id)}`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify({
                            action: "seen",
                            messageId: latestId,
                        }),
                    },
                ).catch(() => {});
        };
        seen();
        document.addEventListener("visibilitychange", seen);
        return () => document.removeEventListener("visibilitychange", seen);
    }, [
        config.data?.messengerSettings?.emailNotifications,
        viewingThread,
        data.data?.conversationId,
        latestId,
        token,
        baseUrl,
    ]);
    const lastMessageId = data.data?.messages.at(-1)?.id;
    useEffect(() => {
        if (!isHome && !isNew && lastMessageId && follow.current)
            end.current?.scrollIntoView({ block: "end" });
    }, [lastMessageId, opened, isHome, isNew]);
    function changeConversation(view: string, id?: string) {
        if (!history.enabled || navigationBusy) {
            parentMessage("sendb:error", {
                message: inquiryPending
                    ? "기존 문의를 먼저 확인한 뒤 다시 선택해주세요. 작성 내용은 보관되어 있습니다."
                    : "전송 또는 회원 연결을 마친 뒤 다시 선택해주세요.",
                status: 409,
            });
            return;
        }
        if (view === "list") {
            setIsHome(false);
            history.showList();
            return;
        }
        if (
            view !== "new" &&
            (view !== "thread" || !id || !conversationUuid.test(id))
        ) {
            parentMessage("sendb:error", {
                message: "문의 정보를 확인해주세요.",
                status: 400,
            });
            return;
        }
        let from = draftKey;
        setIsHome(false);
        const target = view === "new" ? "new" : id!;
        try {
            if (from === "current" && currentResolved) {
                from = data.data?.conversationId ?? "new";
                attachments.moveTo(`${channelKey}:${from}`);
            }
            drafts.current.set(from, {
                text,
                suggestion: suggestedText,
                pending: pending.current,
                handoff: handoffPending.current,
            });
            const next = drafts.current.get(target);
            const nextText =
                target === "new" && deferredDraft.current !== null
                    ? mergeCustomerDraftText(
                          next?.text ?? "",
                          next?.suggestion ?? "",
                          deferredDraft.current,
                      )
                    : {
                          text: next?.text ?? "",
                          suggestion: next?.suggestion ?? "",
                      };
            generation.current++;
            setDraftKey(target);
            setText(nextText.text);
            setSuggestedText(nextText.suggestion);
            if (target === "new") {
                deferredDraft.current = null;
                setHasDeferredDraft(false);
            }
            pending.current = next?.pending ?? null;
            handoffPending.current = next?.handoff ?? null;
            setOlder([]);
            setCanLoad(true);
            setError("");
            follow.current = true;
            if (view === "new") history.newInquiry();
            else history.open(id!);
        } catch (error) {
            setError((error as Error).message);
        }
    }
    navigation.current = changeConversation;
    openLatest.current = (conversationId?: unknown) => {
        if (history.enabled) {
            if (typeof conversationId === "string" && conversationUuid.test(conversationId)) changeConversation("thread", conversationId);
            return;
        }
        setThreadList(false);
        setIsHome(false);
    };
    // Pin the first resolved member inquiry. Another device starting a new
    // inquiry must not silently change the destination of this draft.
    useEffect(() => {
        const id = data.data?.conversationId;
        if (
            !history.enabled ||
            history.view !== "current" ||
            !currentResolved ||
            busy ||
            linking
        )
            return;
        const target = id ?? "new";
        if (draftKey === "current") {
            try {
                moveAttachments.current(`${channelKey}:${target}`);
                setDraftKey(target);
            } catch (error) {
                setError((error as Error).message);
                return;
            }
        }
        if (id) openConversation(id);
        else startInquiry();
    }, [
        history.enabled,
        history.view,
        openConversation,
        startInquiry,
        currentResolved,
        channelKey,
        data.data?.conversationId,
        draftKey,
        busy,
        linking,
    ]);
    useEffect(() => {
        if (
            data.error &&
            configuration &&
            acknowledgedConfiguration.current === configuration.nonce
        )
            parentMessage("sendb:error", {
                message: data.error.message,
                status:
                    data.error instanceof InboxRequestError
                        ? data.error.status
                        : 500,
            });
    }, [data.error, configuration, parentMessage]);
    useEffect(() => {
        if (outgoing) end.current?.scrollIntoView({ block: "end" });
    }, [outgoing]);
    const color = config.data?.color ?? "#635BFF";
    const channelName = config.data?.name ?? "고객 상담";
    const avatar = config.data?.messengerSettings?.profileImageUrl || brand?.iconUrl;
    const contactSettings = config.data?.messengerSettings;
    async function send() {
        if (
            busy ||
            linking ||
            inquiryPending ||
            !canWrite ||
            (!text.trim() && !attachments.files.length)
        )
            return;
        if (isNew && handoffPending.current) {
            setError(
                "상담원 연결 요청을 다시 눌러 결과를 확인해주세요. 작성 내용은 보관되어 있습니다.",
            );
            return;
        }
        const body = text.trim();
        const snapshot = contactSnapshot();
        setBusy(true);
        setError("");
        const currentGeneration = generation.current;
        if (
            pending.current?.body !== body ||
            pending.current?.files !== attachments.signature
        )
            pending.current = {
                body,
                id: crypto.randomUUID(),
                files: attachments.signature,
            };
        const sent = { id: pending.current!.id, body };
        if (body) {
            setOutgoing(sent);
            setText("");
            follow.current = true;
        }
        const restore = () => {
            setOutgoing((current) => (current?.id === sent.id ? null : current));
            if (body) setText((current) => current || body);
        };
        try {
            let session = token;
            if (!session) {
                const result = await inboxRequest<{ token: string }>(
                    `/api/messenger/${channelKey}`,
                    {
                        method: "POST",
                        body: JSON.stringify({
                            action: "session",
                            name: name.trim() || "방문 고객",
                            email: email.trim(),
                            pageUrl:
                                pageUrl ||
                                new URLSearchParams(window.location.search).get(
                                    "page",
                                ) ||
                                undefined,
                        }),
                        headers: { "Content-Type": "application/json" },
                    },
                );
                if (currentGeneration !== generation.current) return restore();
                session = result.token;
                // First anonymous session belongs to the current draft; parent echo must not reset it.
                configured.current = draftSessionKey(session);
                setToken(session);
                if (managed) parentMessage("sendb:session", { token: session });
                else
                    try {
                        localStorage.setItem(storageKey, session);
                    } catch {
                        /* 현재 창 세션 유지 */
                    }
            }
            const attachmentIds = await attachments.prepare(
                uploadUrl,
                "customer",
                { Authorization: `Bearer ${session}` },
            );
            if (currentGeneration !== generation.current) return restore();
            const result = await inboxRequest<{ conversationId?: string }>(
                isNew ? `${baseUrl}/conversations` : selectedUrl,
                {
                    method: "POST",
                    body: JSON.stringify({
                        clientId: pending.current!.id,
                        body,
                        attachmentIds,
                    }),
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${session}`,
                    },
                },
            );
            if (currentGeneration !== generation.current) return restore();
            await savePendingContact(
                session,
                result.conversationId ?? selectedId,
                snapshot,
            );
            setText("");
            attachments.clear();
            pending.current = null;
            follow.current = true;
            if (isNew && result.conversationId) {
                drafts.current.delete("new");
                setDraftKey(result.conversationId);
                history.open(result.conversationId);
            } else await data.mutate();
            void history.refresh();
        } catch (e) {
            restore();
            if (currentGeneration === generation.current)
                setError((e as Error).message);
        } finally {
            if (currentGeneration === generation.current) setBusy(false);
        }
    }
    const messages =
        isNew || linking || !detailResolved
            ? []
            : [
                  ...older.filter(
                      (o) => !data.data?.messages.some((m) => m.id === o.id),
                  ),
                  ...(data.data?.messages ?? []),
              ].filter(
                  (message) =>
                      message.kind === "customer" || message.kind === "reply",
              );
    const firstCustomer = messages.findIndex((m) => m.kind === "customer");
    useVisibleMessageReceipts(
        scroll,
        viewingThread && data.data?.conversationId ? `${baseUrl}?conversationId=${data.data.conversationId}` : null,
        messages, "reply", token,
    );
    const showOutgoing = !!outgoing && !messages.some((m) => m.clientId === outgoing.id);
    const unreadCount = history.enabled
        ? (history.unreadCount ?? 0)
        : (data.data?.messages.filter(
              (message) => message.kind === "reply" && message.id > readId,
          ).length ?? 0);
    // 비회원의 지금 상담이 이미 종료됨 — 홈에 "이어가기" 대신 새 상담으로 보여준다
    const closedVisitorChat =
        !history.enabled && !token.includes(".") && detailResolved && data.data?.status === "closed";
    function showConversations() {
        if (navigationBusy) return;
        if (history.enabled) changeConversation("list");
        else {
            void threads.refresh();
            setThreadList(true);
            setIsHome(false);
        }
    }
    if (baseError || blocked)
        return (
            <div className="flex h-dvh items-center justify-center bg-white p-8 text-center text-sm text-gray-500">
                {blocked
                    ? "이 사이트에는 상담창이 설치되어 있지 않습니다."
                    : baseError}
            </div>
        );
    return (
        <div className="relative flex h-dvh flex-col bg-white font-sans text-gray-900">
            {leaveOpen && (
                <div role="dialog" aria-modal="true" aria-labelledby="leave-title" className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
                    <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center">
                        <h2 id="leave-title" className="text-base font-bold">채팅을 나가시나요?</h2>
                        <p className="mt-2 text-sm leading-6 text-gray-600">
                            나가면 이 상담이 종료돼요. 아직 답변을 기다리는 중이라면 답변을 받을 수 없어요.
                        </p>
                        <div className="mt-5 grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                autoFocus
                                disabled={leaving}
                                onClick={() => setLeaveOpen(false)}
                                className="rounded-xl bg-gray-100 py-3 text-sm font-semibold text-gray-900 disabled:opacity-50"
                            >
                                취소
                            </button>
                            <button
                                type="button"
                                disabled={leaving}
                                onClick={async () => {
                                    setLeaving(true);
                                    try {
                                        await inboxRequest(selectedUrl, {
                                            method: "POST",
                                            headers: { Authorization: `Bearer ${token}` },
                                            body: JSON.stringify({ action: "leave" }),
                                        });
                                        setLeaveOpen(false);
                                        setIsHome(true);
                                        // 비회원은 이 브라우저의 상담을 끊어, 홈에 "상담 시작하기"가 나오고 대화 목록도 비게 한다
                                        if (!token.includes(".")) {
                                            threads.remove(token);
                                            resetVisitorSession();
                                        } else await data.mutate();
                                    } catch (e) {
                                        setError((e as Error).message);
                                        setLeaveOpen(false);
                                    } finally {
                                        setLeaving(false);
                                    }
                                }}
                                className="rounded-xl bg-red-500 py-3 text-sm font-semibold text-white disabled:opacity-50"
                            >
                                {leaving ? "나가는 중…" : "나가기"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {isHome ? (
                <MessengerHome
                    brand={brand}
                    name={config.data?.name ?? "고객 상담"}
                    greeting={config.data?.greeting ?? ""}
                    settings={config.data?.messengerSettings}
                    color={color}
                    businessHours={config.data?.businessHours}
                    busy={navigationBusy}
                    loading={!config.data}
                    unread={unreadCount}
                    hasConversations={
                        history.enabled
                            ? history.rows.length > 0
                            : threads.rows.length > 0 || (!!token && detailResolved && messages.length > 0 && !closedVisitorChat)
                    }
                    onStart={() => {
                        if (navigationBusy) return;
                        if (history.enabled) changeConversation("new");
                        else {
                            // 진행 중인 대화가 있어도 "상담 새로 열기"는 새 대화로 시작한다 (지난 대화는 대화 목록에 남는다).
                            // 종료된 상담(나가기 등)이 남아 있어도 새로 시작한다
                            if (closedVisitorChat || (token && messages.length > 0)) resetVisitorSession();
                            setThreadList(false);
                            setIsHome(false);
                        }
                    }}
                    onConversations={showConversations}
                />
            ) : (
                <>
                    {/* 나가기: 진행 중인 상담이 있을 때만 확인창을 띄우고, 아니면 바로 홈으로 */}
                    <ChatHeader
                        name={channelName}
                        avatar={avatar}
                        color={color}
                        onBack={() => {
                            setThreadList(false);
                            setIsHome(true);
                        }}
                        leaveDisabled={navigationBusy}
                        onLeave={
                            isList || threadList
                                ? undefined
                                : () => {
                                      if (!readOnly && !isNew && !!data.data?.conversationId && data.data.status !== "closed") setLeaveOpen(true);
                                      else {
                                          if (closedVisitorChat) resetVisitorSession();
                                          setIsHome(true);
                                      }
                                  }
                        }
                    />
                    {hasDeferredDraft && (
                        <div
                            role="status"
                            className="shrink-0 border-b bg-blue-50 px-4 py-3 text-xs text-blue-900"
                        >
                            <p>
                                사이트에서 전달한 문구를 새 문의 초안으로
                                보관했습니다. 새 문의를 열어 내용을 확인한 뒤
                                직접 보내주세요.
                            </p>
                            <button
                                type="button"
                                disabled={navigationBusy || !history.enabled}
                                onClick={() => changeConversation("new")}
                                className="mt-2 underline disabled:opacity-50"
                            >
                                새 문의 초안 열기
                            </button>
                        </div>
                    )}
                    {isList ? (
                        <CustomerConversationList
                            embedded
                            history={history}
                            busy={navigationBusy}
                            onOpen={(id) => changeConversation("thread", id)}
                            onNew={() => changeConversation("new")}
                            onBack={() => {
                                if (draftKey === "new") history.newInquiry();
                                else if (conversationUuid.test(draftKey))
                                    history.open(draftKey);
                                else history.reset();
                            }}
                        />
                    ) : threadList && !history.enabled ? (
                        <VisitorThreadList
                            rows={threads.rows}
                            loading={threads.loading}
                            color={color}
                            current={token}
                            onOpen={(t) => (t === token ? (setThreadList(false), setIsHome(false)) : openVisitorThread(t))}
                            onNew={() => {
                                if (token && messages.length > 0) resetVisitorSession();
                                setThreadList(false);
                                setIsHome(false);
                            }}
                        />
                    ) : (
                        <>
                            <div
                                ref={scroll}
                                onScroll={() => {
                                    const el = scroll.current;
                                    if (el)
                                        follow.current =
                                            el.scrollHeight -
                                                el.scrollTop -
                                                el.clientHeight <
                                            80;
                                }}
                                className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5"
                                role="log"
                                aria-label="고객 상담 대화"
                            >
                                {config.data && !readOnly && !messages.length && (isNew || !detailPending) && (
                                    <StaffMessage name={channelName} avatar={avatar} color={color}>
                                        <FormattedText text={config.data.greeting} />
                                    </StaffMessage>
                                )}
                                {detailPending && !data.error && (
                                    <p
                                        role="status"
                                        className="text-xs text-gray-500"
                                    >
                                        문의를 확인하고 있습니다. 작성 중인
                                        내용은 보관됩니다.
                                    </p>
                                )}
                                {readOnly && (
                                    <div
                                        className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-600"
                                        role="status"
                                        aria-label="이전 상담 안내"
                                    >
                                        <h2 className="font-semibold text-gray-900">
                                            이전 상담 · 읽기 전용
                                        </h2>
                                        <p className="mt-1">
                                            이전에 나눈 공개 대화와 첨부파일을
                                            확인할 수 있습니다. 이 기록에는
                                            메시지를 보내거나 상담원을 요청할 수
                                            없습니다. 추가로 궁금한 점은 새
                                            문의로 남겨주세요.
                                        </p>
                                    </div>
                                )}
                                {data.error && (
                                    <div
                                        role="alert"
                                        className="space-y-2 rounded-xl bg-red-50 p-3 text-xs text-red-700"
                                    >
                                        <p>{data.error.message}</p>
                                        <button
                                            onClick={() => {
                                                void data.mutate();
                                            }}
                                        >
                                            다시 불러오기
                                        </button>
                                        {detailAccessDenied && <button
                                            className="ml-4"
                                            onClick={() => {
                                                if (
                                                    managed &&
                                                    token.includes(".")
                                                ) {
                                                    parentMessage(
                                                        "sendb:refresh",
                                                    );
                                                    return;
                                                }
                                                const expectedGeneration = generation.current;
                                                confirm({
                                                    title: "새 문의를 시작할까요?",
                                                    description: "이전 대화는 이 브라우저에서 다시 볼 수 없습니다. 작성 중인 초안과 첨부도 지워집니다.",
                                                    confirmLabel: "새 문의 시작",
                                                    onConfirm: async () => {
                                                        if (expectedGeneration !== generation.current) return;
                                                        resetVisitorSession();
                                                    },
                                                });
                                            }}
                                        >
                                            {managed && token.includes(".")
                                                ? "회원 다시 연결"
                                                : "새 문의 시작"}
                                        </button>}
                                        {confirmationDialog}
                                    </div>
                                )}
                                {!isNew &&
                                    detailResolved &&
                                    data.data?.hasOlder &&
                                    canLoad && (
                                        <button
                                            className="w-full text-xs text-gray-500"
                                            onClick={async () => {
                                                const currentGeneration =
                                                    generation.current;
                                                try {
                                                    const result =
                                                        await inboxRequest<{
                                                            messages: CustomerMessage[];
                                                            hasOlder: boolean;
                                                        }>(
                                                            `${selectedUrl}${selectedId ? "&" : "?"}before=${messages[0]?.id}`,
                                                            {
                                                                headers: {
                                                                    Authorization: `Bearer ${token}`,
                                                                },
                                                            },
                                                        );
                                                    if (
                                                        currentGeneration !==
                                                        generation.current
                                                    )
                                                        return;
                                                    follow.current = false;
                                                    setOlder((o) => [
                                                        ...result.messages,
                                                        ...o,
                                                    ]);
                                                    setCanLoad(result.hasOlder);
                                                } catch (e) {
                                                    if (
                                                        currentGeneration ===
                                                        generation.current
                                                    )
                                                        setError(
                                                            (e as Error)
                                                                .message,
                                                        );
                                                }
                                            }}
                                        >
                                            이전 메시지 보기
                                        </button>
                                    )}
                                {messages.map((m, i) => {
                                    const time = (
                                        <time dateTime={m.createdAt}>
                                            {readOnly ? customerConversationTimestamp(m.createdAt) : messageTime(m.createdAt)}
                                        </time>
                                    );
                                    const files = (
                                        <AttachmentList
                                            files={m.attachments}
                                            url={(id) =>
                                                `${baseUrl}/attachments/${id}${selectedId ? `?conversationId=${encodeURIComponent(selectedId)}` : ""}`
                                            }
                                            headers={{
                                                Authorization: `Bearer ${token}`,
                                            }}
                                        />
                                    );
                                    return m.kind === "customer" ? (
                                        <div key={m.id} className="space-y-4">
                                            <CustomerMessage time={<>{time}{!readOnly && m.recipientReadAt && " · 읽음"}</>}>
                                                {m.body && (
                                                    <div className={customerBubbleClass}>
                                                        <FormattedText text={m.body} />
                                                    </div>
                                                )}
                                                {files}
                                            </CustomerMessage>
                                            {/* 업무시간 밖이면 고객 첫 메시지 뒤에 부재 안내 (상담 설정 › 업무 시간 › 업무시간 밖 안내) */}
                                            {i === firstCustomer && !readOnly && !isNew && !config.data?.messengerSettings?.aiAvailable && config.data?.businessHours && !config.data.businessHours.open && config.data.businessHours.awayMessage && (
                                                <StaffMessage name={channelName} avatar={avatar} color={color} time={time}>
                                                    <p className="whitespace-pre-wrap">{config.data.businessHours.awayMessage}</p>
                                                </StaffMessage>
                                            )}
                                            {/* 고객이 처음 남긴 메시지 바로 뒤에 연락처 받기 */}
                                            {i === firstCustomer && contactSettings?.contactEnabled && !readOnly && !isNew && detailResolved && data.data?.conversationId && (
                                                <StaffMessage name={channelName} avatar={avatar} color={color} time={time}>
                                                    <p className="whitespace-pre-wrap">{contactSettings.contactPrompt}</p>
                                                    <ReplyContactForm
                                                        key={`${draftSessionKey(token)}:${data.data.conversationId}`}
                                                        channelKey={channelKey}
                                                        color={color}
                                                        token={token}
                                                        conversationId={data.data.conversationId}
                                                        fields={contactSettings.contactFields}
                                                        profile={data.data.profile}
                                                        initialDraft={contactSeed && contactSeed.id === data.data.conversationId ? contactSeed.draft : null}
                                                        onDraft={(draft) => {
                                                            replyContactDraft.current = draft ? { token, key: draftKey, draft } : null;
                                                        }}
                                                    />
                                                </StaffMessage>
                                            )}
                                        </div>
                                    ) : (
                                        <StaffMessage key={m.id} receiptId={m.id} name={channelName} avatar={avatar} color={color} time={time}>
                                            {m.body && (
                                                <div className="whitespace-pre-wrap">
                                                    <FormattedText text={m.body} />
                                                </div>
                                            )}
                                            {files}
                                        </StaffMessage>
                                    );
                                })}
                                {showOutgoing && (
                                    <div className="opacity-60">
                                        <CustomerMessage time={null}>
                                            <div className={customerBubbleClass}>
                                                <FormattedText text={outgoing.body} />
                                            </div>
                                        </CustomerMessage>
                                    </div>
                                )}
                                {/* AI가 답장을 만드는 동안 점 세 개가 움직인다 */}
                                {!isNew && data.data?.aiTyping && (
                                    <div role="status" aria-label="답변을 작성하고 있어요" className="flex w-fit items-center gap-1 py-2">
                                        {[0, 150, 300].map((delay) => (
                                            <span
                                                key={delay}
                                                className="h-2 w-2 animate-bounce rounded-full bg-gray-400"
                                                style={{ animationDelay: `${delay}ms` }}
                                            />
                                        ))}
                                    </div>
                                )}
                                <div ref={end} />
                            </div>
                            {!isNew &&
                                !readOnly &&
                                detailResolved &&
                                data.data?.status === "closed" && (
                                    <p className="bg-gray-50 px-5 py-2 text-center text-xs text-gray-500">
                                        상담이 종료되었습니다. 메시지를 보내면
                                        다시 연결됩니다.
                                    </p>
                                )}
                            {error && (
                                <p
                                    role="alert"
                                    className="px-5 pb-2 text-xs text-red-600"
                                >
                                    {error}
                                </p>
                            )}
                            {linking && (
                                <p
                                    role="status"
                                    className="px-4 text-sm text-gray-500"
                                >
                                    회원 상담 이력을 연결하고 있습니다…
                                </p>
                            )}
                            {config.data &&
                                data.data?.aiState === "human" &&
                                !readOnly &&
                                !isNew && (
                                    <p
                                        role="status"
                                        className="border-t bg-gray-50 px-4 py-3 text-xs leading-5 text-gray-600"
                                    >
                                        {config.data.businessHours?.open
                                            ? "상담원 연결 요청을 접수했습니다 🙂 궁금하신 점을 미리 남겨주시면 더 빠른 상담이 가능해요."
                                            : "현재는 고객센터 운영시간 밖입니다. 문의를 미리 남겨주시면 다음 운영시간에 담당자가 이어서 안내드립니다."}
                                    </p>
                                )}
                            {!readOnly && (
                                    <button
                                        type="button"
                                        disabled={
                                            busy ||
                                            linking ||
                                            inquiryPending ||
                                            !canWrite ||
                                            (!isNew &&
                                                data.data?.aiState ===
                                                    "human") ||
                                            detailAccessDenied
                                        }
                                        onClick={() => void requestHuman()}
                                        className="shrink-0 px-5 py-2 text-xs text-gray-500 underline disabled:no-underline"
                                    >
                                        {!isNew &&
                                        data.data?.aiState === "human"
                                            ? "상담원이 이어서 안내드립니다"
                                            : "상담원 연결 요청"}
                                    </button>
                                )}
                            {readOnly ? (
                                <div className="shrink-0 border-t border-gray-100 p-4">
                                    <button
                                        type="button"
                                        disabled={navigationBusy}
                                        onClick={() =>
                                            changeConversation("new")
                                        }
                                        className="w-full rounded-xl px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
                                        style={{ backgroundColor: color }}
                                    >
                                        새 문의로 상담 시작하기
                                    </button>
                                </div>
                            ) : (
                                <form
                                    className="shrink-0 px-3 pb-3 pt-1"
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        void send();
                                    }}
                                >
                                    {suggestedText && (
                                        <div
                                            role="status"
                                            className="mb-3 rounded-xl bg-blue-50 p-3 text-xs text-blue-900"
                                        >
                                            <p>
                                                작성 중인 문장을 보관했습니다.
                                                신청 내용으로 바꿀까요?
                                            </p>
                                            <button
                                                type="button"
                                                className="mr-4 mt-2 underline"
                                                onClick={() => {
                                                    setText(suggestedText);
                                                    setSuggestedText("");
                                                }}
                                            >
                                                신청 내용으로 바꾸기
                                            </button>
                                            <button
                                                type="button"
                                                className="underline"
                                                onClick={() =>
                                                    setSuggestedText("")
                                                }
                                            >
                                                작성 중인 문장 유지
                                            </button>
                                        </div>
                                    )}
                                    <AttachmentDrafts
                                        picker={false}
                                        files={attachments.files}
                                        busy={
                                            busy ||
                                            linking ||
                                            !canWrite ||
                                            !config.data
                                        }
                                        progress={attachments.progress}
                                        onSelect={attachments.select}
                                        onRemove={(id) =>
                                            attachments.remove(id, uploadUrl, {
                                                Authorization: `Bearer ${token}`,
                                            })
                                        }
                                        onError={setError}
                                    />
                                    <div
                                        className={`mt-2 rounded-xl border bg-gray-100 px-3 pb-2 pt-3 transition-colors first:mt-0 ${dragging ? "border-dashed border-gray-400 bg-gray-200/70" : "border-transparent"}`}
                                        onDragOver={(e) => {
                                            if (!e.dataTransfer.types.includes("Files")) return;
                                            e.preventDefault();
                                            setDragging(true);
                                        }}
                                        onDragLeave={(e) => {
                                            if (!e.currentTarget.contains(e.relatedTarget as Node | null))
                                                setDragging(false);
                                        }}
                                        onDrop={(e) => {
                                            if (!e.dataTransfer.files.length) return;
                                            e.preventDefault();
                                            setDragging(false);
                                            if (busy || linking || !canWrite || !config.data) return;
                                            try {
                                                attachments.select(e.dataTransfer.files);
                                            } catch (error) {
                                                setError((error as Error).message);
                                            }
                                        }}
                                    >
                                        <textarea
                                            aria-label="문의 메시지"
                                            disabled={
                                                busy || linking || !canWrite
                                            }
                                            value={text}
                                            maxLength={5000}
                                            onChange={(e) =>
                                                setText(e.target.value)
                                            }
                                            placeholder={
                                                dragging
                                                    ? "여기에 파일을 놓으면 첨부돼요"
                                                    : "메시지를 입력해주세요"
                                            }
                                            rows={2}
                                            onKeyDown={(e) => {
                                                // Enter 전송, Shift+Enter 줄바꿈, 한글 조합 중 Enter는 무시
                                                if (
                                                    e.key === "Enter" &&
                                                    !e.shiftKey &&
                                                    !e.nativeEvent.isComposing
                                                ) {
                                                    e.preventDefault();
                                                    void send();
                                                }
                                            }}
                                            className="block w-full resize-none bg-transparent text-[15px] outline-none placeholder:text-gray-400"
                                        />
                                        <div className="mt-1 flex items-center justify-between">
                                            <AttachmentPicker
                                                busy={
                                                    busy ||
                                                    linking ||
                                                    !canWrite ||
                                                    !config.data
                                                }
                                                full={attachments.files.length >= 5}
                                                onSelect={attachments.select}
                                                onError={setError}
                                            />
                                            <button
                                                aria-label="문의 보내기"
                                                disabled={
                                                    busy ||
                                                    linking ||
                                                    inquiryPending ||
                                                    !canWrite ||
                                                    (!text.trim() &&
                                                        !attachments.files
                                                            .length) ||
                                                    !config.data ||
                                                    detailAccessDenied
                                                }
                                                className="flex h-9 w-9 items-center justify-center rounded-lg text-white disabled:opacity-40"
                                                style={{ backgroundColor: color }}
                                            >
                                                {busy && !showOutgoing ? (
                                                    <RotateCcw
                                                        size={17}
                                                        className="animate-spin"
                                                    />
                                                ) : (
                                                    <ArrowUp size={17} />
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                </form>
                            )}
                        </>
                    )}
                </>
            )}
            {isHome && (
                <HomeNav color={color} unread={unreadCount} disabled={navigationBusy || !config.data} onHome={() => setIsHome(true)} onChats={showConversations} />
            )}
        </div>
    );
}
