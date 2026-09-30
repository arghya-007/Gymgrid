"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const upcomingNavigation: string[] = [];

export function GymNavigation({
  organizationSlug,
  canManageCheckIns,
  canViewOperationalReports,
  mobile = false,
}: {
  organizationSlug: string;
  canManageCheckIns: boolean;
  canViewOperationalReports: boolean;
  mobile?: boolean;
}) {
  const pathname = usePathname();
  const overviewHref = `/gym/${organizationSlug}`;
  const membersHref = `${overviewHref}/members`;
  const plansHref = `${overviewHref}/plans`;
  const teamHref = `${overviewHref}/team`;
  const leadsHref = `${overviewHref}/leads`;
  const paymentsHref = `${overviewHref}/payments`;
  const checkInsHref = `${overviewHref}/check-ins`;
  const reportsHref = `${overviewHref}/reports`;
  const classesHref = `${overviewHref}/classes`;
  const items = [
    { label: "Overview", href: overviewHref, active: pathname === overviewHref },
    {
      label: "Members",
      href: membersHref,
      active: pathname === membersHref || pathname.startsWith(`${membersHref}/`),
    },
    {
      label: "Membership plans",
      href: plansHref,
      active: pathname === plansHref || pathname.startsWith(`${plansHref}/`),
    },
    {
      label: "Team",
      href: teamHref,
      active: pathname === teamHref || pathname.startsWith(`${teamHref}/`),
    },
    {
      label: "Leads",
      href: leadsHref,
      active: pathname === leadsHref || pathname.startsWith(`${leadsHref}/`),
    },
    {
      label: "Payments",
      href: paymentsHref,
      active:
        pathname === paymentsHref || pathname.startsWith(`${paymentsHref}/`),
    },
    ...(canManageCheckIns
      ? [{
          label: "Check-ins",
          href: checkInsHref,
          active: pathname === checkInsHref || pathname.startsWith(`${checkInsHref}/`),
        }]
      : []),
    ...(canViewOperationalReports
      ? [{
          label: "Reports",
          href: reportsHref,
          active: pathname === reportsHref || pathname.startsWith(`${reportsHref}/`),
        }]
      : []),
    {
      label: "Classes",
      href: classesHref,
      active: pathname === classesHref || pathname.startsWith(`${classesHref}/`),
    },
  ];

  if (mobile) {
    return (
      <nav className="mt-4 flex gap-2 overflow-x-auto" aria-label="Gym administration">
        {items.map((item) => (
          <Link
            className={`whitespace-nowrap rounded-lg px-4 py-2 text-xs font-semibold ${
              item.active
                ? "bg-slate-950 text-white"
                : "bg-slate-100 text-slate-600"
            }`}
            href={item.href}
            key={item.href}
          >
            {item.label}
          </Link>
        ))}
        {upcomingNavigation.map((label) => (
          <span
            aria-disabled="true"
            className="whitespace-nowrap rounded-lg bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-400"
            key={label}
          >
            {label}
          </span>
        ))}
      </nav>
    );
  }

  return (
    <nav className="mt-7 space-y-1" aria-label="Gym administration">
      {items.map((item) => (
        <Link
          className={`flex items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold transition ${
            item.active
              ? "bg-emerald-400 text-slate-950"
              : "text-slate-300 hover:bg-slate-900 hover:text-white"
          }`}
          href={item.href}
          key={item.href}
        >
          {item.label}
          {item.active ? <span aria-hidden="true">→</span> : null}
        </Link>
      ))}
      {upcomingNavigation.map((label) => (
        <span
          aria-disabled="true"
          className="flex cursor-not-allowed items-center justify-between rounded-xl px-4 py-3 text-sm font-medium text-slate-500"
          key={label}
        >
          {label}
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">
            Next
          </span>
        </span>
      ))}
    </nav>
  );
}
