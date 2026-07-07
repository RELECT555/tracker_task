import { useMutation, useQueryClient } from '@tanstack/react-query';
import { requestApi, type RequestAction, type RequestDetail } from '@/entities/request/api/requestApi';
import { queryKeys } from '@/shared/api/queryKeys';

export function useRequestActions(requestId: string) {
  const queryClient = useQueryClient();

  const invalidateRequest = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.requests.detail(requestId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.requests.outbox() });
    queryClient.invalidateQueries({ queryKey: queryKeys.requests.inbox() });
  };

  const submit = useMutation({
    mutationFn: () => requestApi.submit(requestId),
    onSuccess: invalidateRequest,
  });

  const approve = useMutation({
    mutationFn: () => requestApi.approve(requestId),
    onSuccess: invalidateRequest,
  });

  const reject = useMutation({
    mutationFn: (reason: string) => requestApi.reject(requestId, reason),
    onSuccess: invalidateRequest,
  });

  const cancel = useMutation({
    mutationFn: (reason?: string) => requestApi.cancel(requestId, reason),
    onSuccess: invalidateRequest,
  });

  const requestInfo = useMutation({
    mutationFn: (message: string) => requestApi.requestInfo(requestId, message),
    onSuccess: invalidateRequest,
  });

  const provideInfo = useMutation({
    mutationFn: (input: { fields?: Record<string, unknown>; comment?: string }) =>
      requestApi.provideInfo(requestId, input),
    onSuccess: invalidateRequest,
  });

  const escalate = useMutation({
    mutationFn: (reason: string) => requestApi.escalate(requestId, reason),
    onSuccess: invalidateRequest,
  });

  return { submit, approve, reject, cancel, requestInfo, provideInfo, escalate };
}

export function getAvailableActions(data: RequestDetail | undefined): Record<RequestAction, boolean> {
  const actions = data?.availableActions ?? [];
  return {
    submit: actions.includes('submit'),
    approve: actions.includes('approve'),
    reject: actions.includes('reject'),
    request_info: actions.includes('request_info'),
    provide_info: actions.includes('provide_info'),
    escalate: actions.includes('escalate'),
    cancel: actions.includes('cancel'),
  };
}
