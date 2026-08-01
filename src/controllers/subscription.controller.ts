import { Request, Response } from 'express';
import { createRazorPaySubscription } from '../services/subscription.service';
import crypto from 'crypto';
import { handleSubscriptionSuccess } from '../services/subscription.service';
export const checkout = async (req: Request, res: Response) => {
    try {
        const { planType } = req.body;
        const companyId = req.user?.companyId;

        if (!planType || !companyId) {
            res.status(400).json({ error: "Missing Required Fields" });
            return;
        }

        // Decide razorpay id
        let razorpayPlanId = "";
        if (planType === "starter") {
            razorpayPlanId = process.env.RAZORPAY_STARTER_PLAN_ID as string;
        } else if (planType === "business") {
            razorpayPlanId = process.env.RAZORPAY_BUSINESS_PLAN_ID as string;
        } else {
            res.status(400).json({ error: 'invalid plan' });
            return;
        }

        const subscriptionId = await createRazorPaySubscription(razorpayPlanId, companyId);
        res.status(200).json({ subscriptionId });

    } catch (error) {
        console.error("Checkout Controller Error:", error);
        res.status(500).json({ error: "Failed to create subscription" });
    }
};



export const webhook = async (req: Request, res: Response) => {
    try {
        const secret = process.env.RAZORPAY_WEBHOOK_SECRET as string;
        
        // 1. Get the signature from headers
        const signature = req.headers['x-razorpay-signature'] as string;
        
        if (!signature) {
            res.status(400).json({ error: "No signature found" });
            return;
        }

        // 2. Verify signature
        // Razorpay sends the JSON payload as text, we hash it and compare
        const bodyText = JSON.stringify(req.body);
        const expectedSignature = crypto
            .createHmac('sha256', secret)
            .update(bodyText)
            .digest('hex');

        if (expectedSignature !== signature) {
            res.status(400).json({ error: "Invalid signature" });
            return;
        }

        // 3. Process the Event
        const event = req.body.event;
        
        // When payment is captured successfully
        if (event === 'payment.captured' || event === 'subscription.authenticated') {
            const payload = req.body.payload;
            const subscriptionId = payload.subscription?.entity?.id || payload.payment?.entity?.subscription_id;
            const planId = payload.subscription?.entity?.plan_id;
            const companyId = payload.subscription?.entity?.notes?.companyId;

            if (companyId && subscriptionId && planId) {
                // Here we call our BUSINESS LOGIC from the service!
                await handleSubscriptionSuccess(companyId, subscriptionId, planId);
                console.log(`Successfully activated subscription for company: ${companyId}`);
            }
        }

        // Acknowledge receipt to Razorpay
        res.status(200).json({ status: 'ok' });

    } catch (error) {
        console.error("Webhook Error:", error);
        res.status(500).json({ error: "Webhook processing failed" });
    }
};