# Integração Firebase com Pagar.me

Este projeto integra Firebase Cloud Functions com Pagar.me para processamento de pagamentos.

## Pré-requisitos

- Node.js 18 ou superior
- npm (Node Package Manager)
- Firebase CLI
- Conta no Pagar.me
- Projeto Firebase criado

## Configuração do Ambiente

1. **Instalar o Firebase CLI globalmente**
```bash
npm install -g firebase-tools
```

2. **Fazer login no Firebase**
```bash
firebase login
```

3. **Selecionar o projeto**
```bash
firebase use seu-projeto-id
```

## Instalação

1. **Clonar o repositório**
```bash
git clone [URL_DO_REPOSITÓRIO]
cd [NOME_DO_PROJETO]
```

2. **Instalar dependências**
```bash
cd functions
npm install
cd ..
```

## Desenvolvimento Local

1. **Iniciar o emulador do Firebase**
```bash
firebase emulators:start
```

2. **Executar testes**
```bash
cd functions
npm run test
```

## Deploy

1. **Verificar e corrigir problemas de lint**
```bash
cd functions
npm run lint -- --fix
cd ..
```

2. **Fazer deploy das functions**
```bash
firebase deploy --only functions
```

Ou executar tudo em um único comando:
```bash
cd functions && npm run lint -- --fix && cd .. && firebase deploy --only functions
```

## Configuração do Pagar.me

1. Configure as variáveis de ambiente:
```bash
firebase functions:config:set pagarme.api_key="SUA_CHAVE_API"
```

2. Configure o webhook no painel do Pagar.me apontando para a URL da sua function.

## Estrutura do Projeto

```
functions/
├── src/
│   ├── config/         # Configurações
│   ├── handlers/       # Handlers das functions
│   ├── repositories/   # Acesso ao banco de dados
│   ├── services/       # Lógica de negócio
│   └── types/         # Tipos TypeScript
├── test/              # Testes
└── package.json
```

## Configuração do Banco de Dados

### Collections do Firestore

1. **subscriptions**
   - Armazena informações das assinaturas
   - Campos principais:
     - clinicName (string)
     - planId (string)
     - status (string)
     - expirationDate (timestamp)

2. **transactions**
   - Registra transações de pagamento
   - Campos principais:
     - clinicName (string)
     - amount (number)
     - status (string)
     - pagarmeId (string)

## Regras de Segurança

É necessário configurar as regras de segurança do Firestore. Exemplo básico:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /subscriptions/{subscriptionId} {
      allow read: if request.auth != null;
      allow write: if false;
    }
    match /transactions/{transactionId} {
      allow read: if request.auth != null;
      allow write: if false;
    }
  }
}
```

## Testes

### Executando Testes

```bash
cd functions
npm run test
```

### Cobertura de Testes

```bash
npm run test:coverage
```

## Troubleshooting

### Problemas Comuns

1. **Erro de deploy**
   - Verifique se está logado no Firebase
   - Confirme se o projeto está selecionado
   - Verifique se o Node.js está na versão 18

2. **Erro de webhook**
   - Verifique se a URL do webhook está correta
   - Confirme se a chave API do Pagar.me está configurada

3. **Erro de Firestore**
   - Verifique as regras de segurança
   - Confirme se as collections existem

## Monitoramento

### Logs

Visualizar logs das functions:
```bash
firebase functions:log
```

### Métricas

Acesse o Console do Firebase para visualizar:
- Execuções de functions
- Erros
- Latência
- Custos

## Contribuindo

1. Faça um fork do projeto
2. Crie uma branch para sua feature
3. Faça commit das alterações
4. Faça push para a branch
5. Abra um Pull Request

## Documentação Adicional

- Para detalhes sobre as functions implementadas, consulte [FUNCTIONS.md](./functions/FUNCTIONS.md)
- [Documentação do Firebase](https://firebase.google.com/docs)
- [Documentação do Pagar.me](https://docs.pagar.me)

## Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

## Suporte

Para suporte, abra uma issue no repositório ou entre em contato com a equipe de desenvolvimento.