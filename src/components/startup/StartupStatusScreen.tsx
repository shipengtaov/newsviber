import { cn } from "@/lib/utils";

type StartupStatusScreenProps = {
  title: string;
  kicker?: string | null;
  description?: string | null;
  preserveCopySpace?: boolean;
  detail?: string | null;
  showRetry?: boolean;
  onRetry?: () => void;
  className?: string;
};

export function StartupStatusScreen({
  title,
  kicker = "App Startup",
  description = null,
  preserveCopySpace = false,
  detail = null,
  showRetry = false,
  onRetry,
  className,
}: StartupStatusScreenProps) {
  const showKicker = Boolean(kicker);
  const showDescription = Boolean(description);

  return (
    <div className={cn("startup-stage", className)}>
      <div className="startup-shell" role="status" aria-live="polite">
        <div className="startup-shell__content">
          <div className="startup-shell__header">
            <img
              src="/logo_dark_waves.svg"
              alt=""
              aria-hidden="true"
              className="startup-shell__logo"
            />
            <div className="startup-shell__text">
              {showKicker ? (
                <div className="startup-shell__kicker">{kicker}</div>
              ) : preserveCopySpace ? (
                <div
                  aria-hidden="true"
                  className="startup-shell__kicker startup-shell__copy-placeholder"
                />
              ) : null}
              <h1 className="startup-shell__title">{title}</h1>
              {showDescription ? (
                <p className="startup-shell__description">{description}</p>
              ) : preserveCopySpace ? (
                <p
                  aria-hidden="true"
                  className="startup-shell__description startup-shell__copy-placeholder"
                />
              ) : null}
            </div>
          </div>
          <div className="startup-shell__progress" aria-hidden="true">
            <span className="startup-shell__progress-bar" />
          </div>
          {detail ? <pre className="startup-shell__detail">{detail}</pre> : null}
          {showRetry ? (
            <button type="button" onClick={onRetry} className="startup-shell__action">
              Retry
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
