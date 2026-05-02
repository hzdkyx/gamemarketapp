import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ArrowRight,
  HelpCircle,
  KeyRound,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@renderer/components/ui/button";
import { useAuth } from "@renderer/lib/auth-context";
import { BRAND_ASSETS } from "@renderer/lib/branding";
import { getDesktopApi } from "@renderer/lib/desktop-api";
import { cn } from "@renderer/lib/utils";
import {
  LOCAL_RECOVERY_TEMPORARY_PASSWORD,
  isPasswordHintTooSimilar,
  type LocalRecoveryUserRecord,
  type UserRole,
  type UserStatus,
} from "../../../shared/contracts";

const PASSWORD_HINT_UNAVAILABLE_MESSAGE =
  "Dica não cadastrada. Por segurança, a senha real não pode ser exibida.";

const roleLabels: Record<UserRole, string> = {
  admin: "Admin",
  operator: "Operador",
  viewer: "Visualizador",
};

const statusLabels: Record<UserStatus, string> = {
  active: "Ativo",
  disabled: "Inativo",
};

const formatDateTime = (value: string | null | undefined): string =>
  value ? new Date(value).toLocaleString("pt-BR") : "-";

const usePrefersReducedMotion = (): boolean => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = (): void => {
      setPrefersReducedMotion(mediaQuery.matches);
    };

    syncPreference();
    mediaQuery.addEventListener("change", syncPreference);

    return () => mediaQuery.removeEventListener("change", syncPreference);
  }, []);

  return prefersReducedMotion;
};

const AuthMotionBackdrop = ({
  variant,
}: {
  variant: "intro" | "login";
}): JSX.Element => {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [videoFailed, setVideoFailed] = useState(false);
  const shouldRenderVideo = !prefersReducedMotion && !videoFailed;

  return (
    <div className="auth-motion-backdrop" aria-hidden="true">
      <div className="auth-fallback-aura" />
      <div className="auth-fallback-grid" />
      {shouldRenderVideo && (
        <video
          className="auth-motion-video"
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          poster={BRAND_ASSETS.introPoster ?? undefined}
          onError={() => setVideoFailed(true)}
        >
          <source
            src={BRAND_ASSETS.introVideo}
            type={BRAND_ASSETS.introVideoType}
          />
        </video>
      )}
      <div
        className={
          variant === "intro"
            ? "auth-motion-overlay auth-motion-overlay-intro"
            : "auth-motion-overlay auth-motion-overlay-login"
        }
      />
    </div>
  );
};

const IntroWelcome = ({ onStart }: { onStart: () => void }): JSX.Element => (
  <section className="relative min-h-screen overflow-hidden bg-background text-slate-100">
    <AuthMotionBackdrop variant="intro" />
    <main className="relative z-10 grid min-h-screen place-items-center px-6 py-10">
      <div className="auth-intro-panel w-full max-w-[720px] text-center">
        <h1 className="sr-only">HzdKyx GameMarket Manager</h1>
        <img
          className="mx-auto h-auto w-[320px] max-w-[76vw] object-contain drop-shadow-[0_0_34px_rgba(139,92,246,0.28)]"
          src={BRAND_ASSETS.logoFull}
          alt="HzdKyx"
        />
        <p className="mt-3 text-sm font-semibold uppercase tracking-[0.22em] text-slate-300">
          GameMarket Manager
        </p>
        <div className="mx-auto mt-10 h-px w-64 max-w-[70vw] bg-gradient-to-r from-transparent via-purple/60 to-transparent" />
        <Button
          className="mx-auto mt-10 h-12 min-w-48 justify-center text-sm font-black tracking-[0.22em]"
          variant="primary"
          type="button"
          onClick={onStart}
        >
          INICIAR
          <ArrowRight size={17} />
        </Button>
      </div>
    </main>
  </section>
);

const AuthFrame = ({
  eyebrow,
  title,
  helper,
  children,
  showIntro = false,
  cinematic = true,
}: {
  eyebrow: string;
  title: string;
  helper: string;
  children: ReactNode;
  showIntro?: boolean;
  cinematic?: boolean;
}): JSX.Element => {
  const [introComplete, setIntroComplete] = useState(!showIntro);

  if (!introComplete) {
    return <IntroWelcome onStart={() => setIntroComplete(true)} />;
  }

  return (
    <div
      className={cn(
        "relative grid min-h-screen place-items-center overflow-hidden bg-background px-6 py-10 text-slate-100",
        cinematic ? "auth-cinematic-stage" : "premium-grid",
      )}
    >
      {cinematic && <AuthMotionBackdrop variant="login" />}
      <div
        className={cn(
          "relative z-10 w-full max-w-md",
          cinematic && "auth-login-card rounded-[22px] p-[1px]",
        )}
      >
        <div className={cn(cinematic ? "p-6 sm:p-7" : "")}>
          <div className="mb-7">
            <img
              className="h-auto w-[178px] max-w-full object-contain drop-shadow-[0_0_22px_rgba(139,92,246,0.2)]"
              src={BRAND_ASSETS.logoFull}
              alt="HzdKyx"
            />
            <div className="mt-2 text-xs font-medium text-slate-400">
              GameMarket Manager
            </div>
          </div>

          <div
            className={cn(
              "overflow-hidden rounded-lg",
              cinematic ? "auth-login-surface" : "premium-surface",
            )}
          >
            <div className="h-px bg-gradient-to-r from-cyan/60 via-purple/45 to-transparent" />
            <div className="p-6">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan">
                {eyebrow}
              </div>
              <h2 className="mt-2 text-2xl font-bold text-white">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">{helper}</p>
              <div className="mt-6">{children}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Field = ({
  label,
  type = "text",
  value,
  autoComplete,
  placeholder,
  maxLength,
  onChange,
}: {
  label: string;
  type?: string;
  value: string;
  autoComplete?: string;
  placeholder?: string;
  maxLength?: number;
  onChange: (value: string) => void;
}): JSX.Element => (
  <label className="block space-y-2">
    <span className="text-xs font-semibold text-slate-400">{label}</span>
    <input
      className="premium-control h-11 w-full px-3"
      type={type}
      value={value}
      autoComplete={autoComplete}
      placeholder={placeholder}
      maxLength={maxLength}
      onChange={(event) => onChange(event.target.value)}
    />
  </label>
);

const RecoveryUserCard = ({
  user,
  selected,
  onSelect,
}: {
  user: LocalRecoveryUserRecord;
  selected: boolean;
  onSelect: () => void;
}): JSX.Element => (
  <button
    className={`w-full rounded-lg border p-4 text-left transition ${
      selected
        ? "border-cyan/70 bg-cyan/10 shadow-glowCyan"
        : "border-line bg-panel hover:border-cyan/35 hover:bg-panelSoft"
    }`}
    type="button"
    onClick={onSelect}
  >
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="font-semibold text-white">{user.name}</div>
        <div className="mt-1 font-mono text-xs text-slate-500">
          {user.username}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-md border border-line px-2 py-1 text-slate-300">
          {roleLabels[user.role]}
        </span>
        <span className="rounded-md border border-line px-2 py-1 text-slate-300">
          {statusLabels[user.status]}
        </span>
      </div>
    </div>
    <div className="mt-4 grid gap-2 text-xs text-slate-400 sm:grid-cols-2">
      <div>Criado em: {formatDateTime(user.createdAt)}</div>
      <div>Último login: {formatDateTime(user.lastLoginAt)}</div>
    </div>
    <div className="mt-3 rounded-md border border-line bg-background/55 p-3 text-sm text-slate-300">
      {user.passwordHint ?? PASSWORD_HINT_UNAVAILABLE_MESSAGE}
    </div>
  </button>
);

const LocalRecoveryDialog = ({
  open,
  users,
  loading,
  error,
  selectedUserId,
  confirmation,
  resetting,
  resetUsername,
  onClose,
  onReload,
  onSelectUser,
  onConfirmationChange,
  onReset,
}: {
  open: boolean;
  users: LocalRecoveryUserRecord[];
  loading: boolean;
  error: string | null;
  selectedUserId: string;
  confirmation: string;
  resetting: boolean;
  resetUsername: string | null;
  onClose: () => void;
  onReload: () => void;
  onSelectUser: (id: string) => void;
  onConfirmationChange: (value: string) => void;
  onReset: () => void;
}): JSX.Element | null => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const focusTimer = window.setTimeout(() => {
      const autofocusTarget =
        panelRef.current?.querySelector<HTMLElement>("[data-autofocus]") ??
        panelRef.current;
      autofocusTarget?.focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onCloseRef.current();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const selectedUser = users.find((user) => user.id === selectedUserId) ?? null;
  const canReset =
    Boolean(selectedUser) &&
    confirmation.trim().toLowerCase() ===
      selectedUser?.username.toLowerCase() &&
    !resetting;

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <div
        ref={panelRef}
        className="modal-panel max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-lg border border-line bg-background shadow-premium"
        role="dialog"
        aria-modal="true"
        aria-labelledby="local-recovery-title"
        tabIndex={-1}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan">
              Recuperação local
            </div>
            <h2
              id="local-recovery-title"
              className="mt-1 text-lg font-bold text-white"
            >
              Esqueci minha senha
            </h2>
          </div>
          <Button
            variant="ghost"
            type="button"
            data-autofocus
            onClick={onClose}
          >
            Fechar
          </Button>
        </div>

        <div className="max-h-[calc(92vh-86px)] space-y-5 overflow-y-auto p-5">
          <div className="grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
            <div className="rounded-lg border border-line bg-panel p-3">
              Isso não recupera senha cloud/workspace.
            </div>
            <div className="rounded-lg border border-line bg-panel p-3">
              Isso não mostra sua senha antiga.
            </div>
            <div className="rounded-lg border border-line bg-panel p-3">
              Senhas são protegidas por hash.
            </div>
            <div className="rounded-lg border border-line bg-panel p-3">
              Tokens e segredos não aparecem aqui.
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-red-200">
              {error}
            </div>
          )}

          {resetUsername && (
            <div className="rounded-md border border-success/30 bg-success/10 p-3 text-sm text-emerald-100">
              Senha local resetada. Entre com o usuário {resetUsername} e senha
              temporária {LOCAL_RECOVERY_TEMPORARY_PASSWORD}. Você deverá trocar
              a senha ao entrar.
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-white">
              Usuários locais cadastrados
            </div>
            <Button
              size="sm"
              variant="ghost"
              type="button"
              disabled={loading}
              onClick={onReload}
            >
              <RotateCcw size={14} />
              Atualizar
            </Button>
          </div>

          {loading ? (
            <div className="rounded-lg border border-line bg-panel p-4 text-sm text-slate-400">
              Carregando usuários locais...
            </div>
          ) : users.length === 0 ? (
            <div className="rounded-lg border border-line bg-panel p-4 text-sm text-slate-400">
              Nenhum usuário local encontrado.
            </div>
          ) : (
            <div className="space-y-3">
              {users.map((user) => (
                <RecoveryUserCard
                  key={user.id}
                  user={user}
                  selected={user.id === selectedUserId}
                  onSelect={() => onSelectUser(user.id)}
                />
              ))}
            </div>
          )}

          <div className="rounded-lg border border-warning/40 bg-warning/10 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 text-warning" size={18} />
              <div className="space-y-2 text-sm text-slate-200">
                <p>
                  Isso vai alterar apenas a senha local deste computador. Não
                  altera a conta cloud/workspace. A nova senha temporária será{" "}
                  {LOCAL_RECOVERY_TEMPORARY_PASSWORD} e será obrigatório trocar
                  após o login.
                </p>
                <p>Para confirmar, digite o username selecionado.</p>
              </div>
            </div>
            <input
              className="focus-ring mt-3 h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
              value={confirmation}
              placeholder={
                selectedUser ? selectedUser.username : "Selecione um usuário"
              }
              onChange={(event) => onConfirmationChange(event.target.value)}
            />
            <div className="mt-3 flex justify-end">
              <Button
                variant="danger"
                type="button"
                disabled={!canReset}
                onClick={onReset}
              >
                <KeyRound size={16} />
                {resetting ? "Resetando..." : "Resetar senha local"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export const LoginPage = (): JSX.Element => {
  const auth = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryUsers, setRecoveryUsers] = useState<LocalRecoveryUserRecord[]>(
    [],
  );
  const [selectedRecoveryUserId, setSelectedRecoveryUserId] = useState("");
  const [recoveryConfirmation, setRecoveryConfirmation] = useState("");
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryResetting, setRecoveryResetting] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [resetUsername, setResetUsername] = useState<string | null>(null);

  const loadRecoveryUsers = async (): Promise<void> => {
    setRecoveryLoading(true);
    setRecoveryError(null);
    setResetUsername(null);

    try {
      const users = await getDesktopApi().auth.listLocalRecoveryUsers();
      setRecoveryUsers(users);
      setSelectedRecoveryUserId(users.length === 1 ? (users[0]?.id ?? "") : "");
      setRecoveryConfirmation("");
    } catch (loadError) {
      setRecoveryError(
        loadError instanceof Error
          ? loadError.message
          : "Falha ao carregar usuários locais.",
      );
    } finally {
      setRecoveryLoading(false);
    }
  };

  const openRecovery = (): void => {
    setRecoveryOpen(true);
    void loadRecoveryUsers();
  };

  const resetLocalPassword = async (): Promise<void> => {
    const selectedUser = recoveryUsers.find(
      (user) => user.id === selectedRecoveryUserId,
    );
    if (!selectedUser) {
      setRecoveryError("Selecione um usuário local.");
      return;
    }

    setRecoveryResetting(true);
    setRecoveryError(null);
    setResetUsername(null);

    try {
      const result = await getDesktopApi().auth.resetLocalPassword({
        userId: selectedUser.id,
        usernameConfirmation: recoveryConfirmation,
        confirmLocalOnly: true,
        confirmTemporaryPassword: true,
      });
      setRecoveryConfirmation("");
      await loadRecoveryUsers();
      setResetUsername(result.user.username);
    } catch (resetError) {
      setRecoveryError(
        resetError instanceof Error
          ? resetError.message
          : "Falha ao resetar senha local.",
      );
    } finally {
      setRecoveryResetting(false);
    }
  };

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await auth.login({ username, password });
    } catch {
      setError("Usuário ou senha inválidos.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthFrame
      eyebrow="Acesso local"
      title="Entrar na operação"
      helper="Entre com seu usuário local para acessar a operação."
      showIntro
    >
      <form className="space-y-4" onSubmit={(event) => void submit(event)}>
        <Field
          label="Usuário"
          value={username}
          autoComplete="username"
          onChange={setUsername}
        />
        <Field
          label="Senha"
          type="password"
          value={password}
          autoComplete="current-password"
          onChange={setPassword}
        />
        {error && (
          <div className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-red-200 shadow-[0_0_24px_rgba(255,77,94,0.08)]">
            {error}
          </div>
        )}
        <Button
          className="w-full"
          variant="primary"
          type="submit"
          disabled={submitting}
        >
          <LockKeyhole size={16} />
          {submitting ? "Entrando..." : "Entrar"}
        </Button>
        <Button
          className="w-full"
          variant="ghost"
          type="button"
          onClick={openRecovery}
        >
          <HelpCircle size={16} />
          Esqueci minha senha
        </Button>
      </form>

      <LocalRecoveryDialog
        open={recoveryOpen}
        users={recoveryUsers}
        loading={recoveryLoading}
        error={recoveryError}
        selectedUserId={selectedRecoveryUserId}
        confirmation={recoveryConfirmation}
        resetting={recoveryResetting}
        resetUsername={resetUsername}
        onClose={() => setRecoveryOpen(false)}
        onReload={() => void loadRecoveryUsers()}
        onSelectUser={(id) => {
          setSelectedRecoveryUserId(id);
          setRecoveryConfirmation("");
          setResetUsername(null);
        }}
        onConfirmationChange={setRecoveryConfirmation}
        onReset={() => void resetLocalPassword()}
      />
    </AuthFrame>
  );
};

export const InitialSetupPage = (): JSX.Element => {
  const auth = useAuth();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordHint, setPasswordHint] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    if (isPasswordHintTooSimilar(password, passwordHint)) {
      setError("A dica não pode ser igual ou muito parecida com a senha.");
      setSubmitting(false);
      return;
    }

    try {
      await auth.setupAdmin({
        name,
        username,
        password,
        confirmPassword,
        passwordHint,
      });
    } catch (setupError) {
      setError(
        setupError instanceof Error
          ? setupError.message
          : "Não foi possível criar o admin inicial. Verifique os dados e tente novamente.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthFrame
      eyebrow="Configuração inicial"
      title="Criar usuário admin"
      helper="Defina o primeiro acesso local. Depois disso, o app sempre abrirá pela tela de login."
    >
      <form className="space-y-4" onSubmit={(event) => void submit(event)}>
        <Field
          label="Nome"
          value={name}
          autoComplete="name"
          onChange={setName}
        />
        <Field
          label="Usuário"
          value={username}
          autoComplete="username"
          onChange={setUsername}
        />
        <Field
          label="Senha"
          type="password"
          value={password}
          autoComplete="new-password"
          onChange={setPassword}
        />
        <Field
          label="Confirmar senha"
          type="password"
          value={confirmPassword}
          autoComplete="new-password"
          onChange={setConfirmPassword}
        />
        <Field
          label="Dica de senha"
          value={passwordHint}
          maxLength={120}
          placeholder="Ex.: padrão da empresa"
          onChange={setPasswordHint}
        />
        {error && (
          <div className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-red-200 shadow-[0_0_24px_rgba(255,77,94,0.08)]">
            {error}
          </div>
        )}
        <Button
          className="w-full"
          variant="primary"
          type="submit"
          disabled={submitting}
        >
          <ShieldCheck size={16} />
          {submitting ? "Criando..." : "Criar admin"}
        </Button>
      </form>
    </AuthFrame>
  );
};

export const ChangePasswordPage = (): JSX.Element => {
  const auth = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await auth.changeOwnPassword({
        currentPassword,
        password,
        confirmPassword,
      });
    } catch (changeError) {
      setError(
        changeError instanceof Error
          ? changeError.message
          : "Falha ao trocar senha.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthFrame
      eyebrow="Senha obrigatória"
      title="Trocar senha"
      helper="Defina uma nova senha antes de continuar."
      cinematic={false}
    >
      <form className="space-y-4" onSubmit={(event) => void submit(event)}>
        <Field
          label="Senha atual"
          type="password"
          value={currentPassword}
          autoComplete="current-password"
          onChange={setCurrentPassword}
        />
        <Field
          label="Nova senha"
          type="password"
          value={password}
          autoComplete="new-password"
          onChange={setPassword}
        />
        <Field
          label="Confirmar nova senha"
          type="password"
          value={confirmPassword}
          autoComplete="new-password"
          onChange={setConfirmPassword}
        />
        {error && (
          <div className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-red-200 shadow-[0_0_24px_rgba(255,77,94,0.08)]">
            {error}
          </div>
        )}
        <Button
          className="w-full"
          variant="primary"
          type="submit"
          disabled={submitting}
        >
          <KeyRound size={16} />
          {submitting ? "Salvando..." : "Salvar senha"}
        </Button>
      </form>
    </AuthFrame>
  );
};

export const AuthLoadingPage = (): JSX.Element => (
  <div className="premium-grid grid min-h-screen place-items-center bg-background text-slate-300">
    <div className="premium-surface rounded-lg px-5 py-4 text-sm font-semibold">
      <span className="status-pulse mr-2 inline-block h-2 w-2 rounded-full bg-cyan" />
      Carregando acesso local...
    </div>
  </div>
);
