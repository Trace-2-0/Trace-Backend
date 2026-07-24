import { rasorpayInstance } from '../lib/razorpay';

export const createRazorPaySubscription = async (planId: string, companyId: string) => {
    const subscription = await rasorpayInstance.subscriptions.create({
        plan_id: planId,
        customer_notify: 1,
        total_count: 12,
        notes: {
            companyId: companyId
        }
    });

    return subscription.id;
};