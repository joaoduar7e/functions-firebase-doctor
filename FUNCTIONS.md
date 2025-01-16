# Documentação das Functions do Firebase

Este documento descreve todas as Cloud Functions implementadas neste projeto.

## Functions HTTP

### `gerarPix`

**Tipo**: Function HTTPS Callable  
**Objetivo**: Gera um QR code de pagamento PIX usando a API do Pagar.me  
**Entrada**:
- `clinicName`: Nome da clínica
- `planId`: ID do plano de assinatura
- `amount`: Valor do pagamento em reais
- `pagarmeData`: Informações do cliente e pagamento

**Saída**:
- `subscriptionId`: ID da assinatura criada/atualizada
- `qrCode`: Texto do QR code PIX
- `qrCodeUrl`: URL para exibir o QR code
- `transactionId`: ID da transação no Pagar.me

### `handlePaymentWebhook`

**Tipo**: Function HTTP Request  
**Objetivo**: Processa webhooks de pagamento do Pagar.me  
**Endpoint**: Configurado nas configurações de webhook do Pagar.me  
**Eventos Suportados**:
- `order.paid`: Confirmação de pagamento
- `order.payment_failed`: Falha no pagamento
- `order.canceled`: Cancelamento do pedido

## Functions Agendadas

### `checkExpiredSubscriptions`

**Tipo**: Function Agendada (Pub/Sub)  
**Agenda**: Executa diariamente às 11:34 (America/Sao_Paulo)  
**Objetivo**: Verifica e atualiza automaticamente assinaturas expiradas  
**Ações**:
- Identifica assinaturas que passaram da data de expiração
- Atualiza o status para "expired"

## Serviços

### SubscriptionService
- Gerencia o ciclo de vida das assinaturas
- Processa atualizações de status de pagamento
- Gerencia expiração de assinaturas

### PaymentProcessor
- Processa webhooks de pagamento
- Atualiza status de assinatura baseado em eventos de pagamento
- Trata falhas e cancelamentos de pagamento

### WebhookService
- Valida payloads de webhook
- Direciona eventos de webhook para os handlers apropriados
- Gerencia tratamento de erros de webhook

### PagarMeService
- Integra com a API do Pagar.me
- Cria transações PIX
- Trata respostas e erros da API

## Repositórios

### FirestoreSubscriptionRepository
- Gerencia dados de assinatura no Firestore
- Realiza operações CRUD para assinaturas
- Consulta assinaturas ativas e expiradas

### TransactionRepository
- Gerencia registros de transações de pagamento
- Rastreia status e histórico de pagamentos
- Vincula transações às assinaturas