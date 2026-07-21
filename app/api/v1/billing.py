"""Billing endpoints — ported from Express src/routes/billing.js.

Stripe checkout, portal, webhook handling, and usage info.
"""
import json
from fastapi import APIRouter, HTTPException, Request, Header

from app.config import get_settings

router = APIRouter(prefix="/billing", tags=["billing"])

PLAN_PRICES = {
    "demo": None,
    "starter": "stripe_price_starter",
    "pro": "stripe_price_pro",
    "enterprise": None,  # contact sales
}


@router.post("/checkout")
async def create_checkout(request: Request):
    """Create a Stripe checkout session for a plan upgrade."""
    body = await request.json()
    plan = body.get("plan", "starter")
    settings = get_settings()

    if plan not in PLAN_PRICES or not PLAN_PRICES[plan]:
        raise HTTPException(400, detail=f"Invalid plan: {plan}")

    # TODO: Wire to actual Stripe SDK once stripe package is installed
    # For now, return a placeholder
    return {
        "url": f"{settings.frontend_url}/billing?session=pending&plan={plan}",
        "plan": plan,
        "status": "pending_implementation",
    }


@router.post("/portal")
async def create_portal(request: Request):
    """Create a Stripe customer portal session."""
    settings = get_settings()
    return {
        "url": f"{settings.frontend_url}/billing/portal",
        "status": "pending_implementation",
    }


@router.post("/webhook")
async def stripe_webhook(request: Request, stripe_signature: str = Header(None, alias="stripe-signature")):
    """Handle Stripe webhook events."""
    body = await request.body()
    settings = get_settings()

    # TODO: Verify webhook signature with settings.stripe_webhook_secret
    event = json.loads(body)

    event_type = event.get("type", "")
    if event_type == "checkout.session.completed":
        # TODO: Update user plan in DB
        pass
    elif event_type == "invoice.paid":
        # TODO: Reset token usage
        pass
    elif event_type == "customer.subscription.deleted":
        # TODO: Downgrade user to demo
        pass

    return {"received": True}


@router.get("/usage")
async def get_usage(request: Request):
    """Get current token usage for the authenticated user."""
    from app.services.usage import usage_service

    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, detail="Authentication required")

    from app.security import decode_token
    payload = decode_token(auth[7:])
    if not payload:
        raise HTTPException(401, detail="Invalid token")

    gid = payload.get("gid", payload["sub"])
    used = usage_service.get_usage(gid)
    plan = "demo"
    from app.services.usage import PLAN_LIMITS
    limit = PLAN_LIMITS.get(plan, 5000)

    return {
        "used": used,
        "limit": limit,
        "remaining": max(0, limit - used),
        "plan": plan,
    }
