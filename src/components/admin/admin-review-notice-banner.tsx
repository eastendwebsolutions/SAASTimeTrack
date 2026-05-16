import type { AdminNoticeType } from "@/lib/admin/review-notice";

type Props = {
  type: AdminNoticeType;
  message: string;
};

export function AdminReviewNoticeBanner({ type, message }: Props) {
  const isSuccess = type === "success";
  return (
    <div
      role="status"
      className={
        isSuccess
          ? "rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100"
          : "rounded-md border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100"
      }
    >
      {message}
    </div>
  );
}
