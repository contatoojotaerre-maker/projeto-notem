import { queryOptions } from '@tanstack/react-query'
import { getWebhooks,getWebhookAlerts } from './webhooks.functions'
export const webhooksQuery=(data:Parameters<typeof getWebhooks>[0]['data'])=>queryOptions({queryKey:['webhooks',data],queryFn:()=>getWebhooks({data})})
export const webhookAlertsQuery=(organization_id:string)=>queryOptions({queryKey:['webhook-alerts',organization_id],queryFn:()=>getWebhookAlerts({data:{organization_id}})})
