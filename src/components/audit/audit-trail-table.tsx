import Link from "next/link";
import { Card } from "@/components/ui/card";

type AuditRow = {
  id: string;
  userEmail: string;
  createdAt: Date;
  fieldName: string;
  beforeValue: string | null;
  afterValue: string | null;
};

type Props = {
  title?: string;
  rows: AuditRow[];
  page: number;
  totalPages: number;
  pageParam: string;
  basePath: string;
  query?: Record<string, string | undefined>;
};

function buildHref(args: { basePath: string; pageParam: string; page: number; query?: Record<string, string | undefined> }) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(args.query ?? {})) {
    if (!value) continue;
    params.set(key, value);
  }
  params.set(args.pageParam, String(args.page));
  const query = params.toString();
  return query ? `${args.basePath}?${query}` : args.basePath;
}

export function AuditTrailTable({ title = "Audit Trail", rows, page, totalPages, pageParam, basePath, query }: Props) {
  const previousPage = Math.max(1, page - 1);
  const nextPage = Math.min(totalPages, page + 1);

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-medium">{title}</h2>
      <Card className="overflow-x-auto p-4">
        {rows.length === 0 ? (
          <p className="text-sm text-zinc-500">No audit entries yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-zinc-400">
              <tr>
                <th className="py-2 pr-4">User</th>
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Time</th>
                <th className="py-2 pr-4">Field</th>
                <th className="py-2 pr-4">Before Value</th>
                <th className="py-2">End Value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-zinc-800 align-top">
                  <td className="py-2 pr-4">{row.userEmail}</td>
                  <td className="py-2 pr-4">{row.createdAt.toLocaleDateString("en-US")}</td>
                  <td className="py-2 pr-4">{row.createdAt.toLocaleTimeString("en-US")}</td>
                  <td className="py-2 pr-4">{row.fieldName}</td>
                  <td className="py-2 pr-4 text-zinc-300">{row.beforeValue ?? "-"}</td>
                  <td className="py-2 text-zinc-100">{row.afterValue ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <div className="flex items-center justify-between text-sm">
        <p className="text-zinc-500">
          Page {page} of {totalPages}
        </p>
        <div className="flex items-center gap-3">
          {page > 1 ? (
            <Link className="underline" href={buildHref({ basePath, pageParam, page: previousPage, query })}>
              Previous
            </Link>
          ) : (
            <span className="text-zinc-600">Previous</span>
          )}
          {page < totalPages ? (
            <Link className="underline" href={buildHref({ basePath, pageParam, page: nextPage, query })}>
              Next
            </Link>
          ) : (
            <span className="text-zinc-600">Next</span>
          )}
        </div>
      </div>
    </div>
  );
}
