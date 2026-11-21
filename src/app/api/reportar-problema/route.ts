import { sendProblemReportEmail } from "@/lib/email/brevo";
import { handleProblemReport } from "@/lib/problem-report";

export function POST(request: Request): Promise<Response> {
  return handleProblemReport(request, { sendEmail: sendProblemReportEmail });
}
