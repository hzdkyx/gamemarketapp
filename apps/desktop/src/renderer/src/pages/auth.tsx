import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { Button } from "@renderer/components/ui/button";
import { useAuth } from "@renderer/lib/auth-context";

const AuthFrame = ({
  eyebrow,
  title,
  helper,
  children
}: {
  eyebrow: string;
  title: string;
  helper: string;
  children: ReactNode;
}): JSX.Element => (
  <div className="grid min-h-screen place-items-center bg-background px-6 py-10 text-slate-100">
    <div className="w-full max-w-md">
      <div className="mb-7 flex items-center gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-lg border border-cyan/30 bg-cyan/10 text-cyan">
          <ShieldCheck size={24} />
        </div>
        <div>
          <div className="text-sm font-bold tracking-wide text-white">HzdKyx</div>
          <div className="text-xs font-medium text-slate-400">GameMarket Manager</div>
        </div>
      </div>

      <div className="rounded-lg border border-line bg-panel/95 p-6 shadow-premium">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan">{eyebrow}</div>
        <h1 className="mt-2 text-2xl font-bold text-white">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">{helper}</p>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  </div>
);

const Field = ({
  label,
  type = "text",
  value,
  autoComplete,
  onChange
}: {
  label: string;
  type?: string;
  value: string;
  autoComplete?: string;
  onChange: (value: string) => void;
}): JSX.Element => (
  <label className="block space-y-2">
    <span className="text-xs font-semibold text-slate-400">{label}</span>
    <input
      className="focus-ring h-11 w-full rounded-md border border-line bg-panelSoft px-3 text-sm text-white"
      type={type}
      value={value}
      autoComplete={autoComplete}
      onChange={(event) => onChange(event.target.value)}
    />
  </label>
);

export const LoginPage = (): JSX.Element => {
  const auth = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      title="HzdKyx GameMarket Manager"
      helper="Entre com seu usuário local para acessar a operação."
    >
      <form className="space-y-4" onSubmit={(event) => void submit(event)}>
        <Field label="Usuário" value={username} autoComplete="username" onChange={setUsername} />
        <Field
          label="Senha"
          type="password"
          value={password}
          autoComplete="current-password"
          onChange={setPassword}
        />
        {error && <div className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-red-200">{error}</div>}
        <Button className="w-full" variant="primary" type="submit" disabled={submitting}>
          <LockKeyhole size={16} />
          {submitting ? "Entrando..." : "Entrar"}
        </Button>
      </form>
    </AuthFrame>
  );
};

export const InitialSetupPage = (): JSX.Element => {
  const auth = useAuth();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await auth.setupAdmin({ name, username, password, confirmPassword });
    } catch (setupError) {
      setError(setupError instanceof Error ? setupError.message : "Falha ao criar admin.");
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
        <Field label="Nome" value={name} autoComplete="name" onChange={setName} />
        <Field label="Usuário" value={username} autoComplete="username" onChange={setUsername} />
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
        {error && <div className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-red-200">{error}</div>}
        <Button className="w-full" variant="primary" type="submit" disabled={submitting}>
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
      await auth.changeOwnPassword({ currentPassword, password, confirmPassword });
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : "Falha ao trocar senha.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthFrame
      eyebrow="Senha obrigatória"
      title="Trocar senha"
      helper="Defina uma nova senha antes de continuar."
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
        {error && <div className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-red-200">{error}</div>}
        <Button className="w-full" variant="primary" type="submit" disabled={submitting}>
          <KeyRound size={16} />
          {submitting ? "Salvando..." : "Salvar senha"}
        </Button>
      </form>
    </AuthFrame>
  );
};

export const AuthLoadingPage = (): JSX.Element => (
  <div className="grid min-h-screen place-items-center bg-background text-slate-300">
    <div className="rounded-lg border border-line bg-panel px-5 py-4 text-sm font-semibold">
      Carregando acesso local...
    </div>
  </div>
);
