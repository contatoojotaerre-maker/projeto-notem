import { queryOptions } from '@tanstack/react-query';
import { getOrgAlerts, getOrgDashboard, getSupportContact } from './panel-home.functions';
export const dashboardQuery = (data: Parameters<typeof getOrgDashboard>[0]['data']) => queryOptions({ queryKey: ['org-dashboard', data], queryFn: () => getOrgDashboard({ data }), refetchInterval: 60_000 });
export const orgAlertsQuery = (data: Parameters<typeof getOrgAlerts>[0]['data']) => queryOptions({ queryKey: ['org-alerts', data], queryFn: () => getOrgAlerts({ data }), refetchInterval: 60_000 });
export const supportContactQuery = () => queryOptions({ queryKey: ['support-contact'], queryFn: () => getSupportContact(), staleTime: 300_000 });
