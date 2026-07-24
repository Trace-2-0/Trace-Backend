import { Request, Response } from 'express';
import { createRazorPaySubscription } from '../services/subscription.service';

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