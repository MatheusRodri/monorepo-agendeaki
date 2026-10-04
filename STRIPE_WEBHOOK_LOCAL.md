# Webhook Stripe local

Com o backend rodando na porta `3001`, abra outro terminal e execute:

```bash
stripe listen --events checkout.session.completed,checkout.session.expired,customer.subscription.created,customer.subscription.updated,customer.subscription.paused,customer.subscription.resumed,customer.subscription.deleted,invoice.paid,invoice.payment_failed --forward-to localhost:3001/api/webhooks/stripe
```

Deixe esse terminal aberto enquanto testa. Copie o `whsec_...` exibido pelo Stripe CLI para `STRIPE_WEBHOOK_SECRET` no `backend/.env` local e reinicie o backend se alterar o arquivo.

O `stripe login` só é necessário uma vez por máquina. O segredo `whsec_...` é sensível: não o commite nem compartilhe.
