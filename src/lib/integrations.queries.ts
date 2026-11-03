import { queryOptions } from '@tanstack/react-query'
import { getIntegrations, getIntegrationLogs } from './integrations.functions'
export const integrationsQuery=(organization_id:string)=>queryOptions({queryKey:['integrations',organization_id],queryFn:()=>getIntegrations({data:{organization_id}})})
export const integrationLogsQuery=(data:Parameters<typeof getIntegrationLogs>[0]['data'])=>queryOptions({queryKey:['integration-logs',data],queryFn:()=>getIntegrationLogs({data})})