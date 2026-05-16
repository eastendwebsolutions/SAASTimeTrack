import { NextResponse } from "next/server";

export type AdminNoticeType = "success" | "error";

export function adminReviewRedirect(requestUrl: string, notice: { type: AdminNoticeType; message: string }) {
  const url = new URL("/admin/review", requestUrl);
  url.searchParams.set("noticeType", notice.type);
  url.searchParams.set("notice", notice.message);
  return NextResponse.redirect(url);
}

export function parseAdminReviewNotice(params: {
  notice?: string;
  noticeType?: string;
}): { type: AdminNoticeType; message: string } | null {
  const message = params.notice?.trim();
  if (!message) return null;
  const type = params.noticeType === "error" ? "error" : "success";
  return { type, message };
}
