import { rasorpayInstance } from '../lib/razorpay';
import { prisma } from '../lib/prisma'; // Assuming prisma is here

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

// This is the actual business logic that runs AFTER payment succeeds
export const handleSubscriptionSuccess = async (companyId: string, subscriptionId: string, planId: string) => {
    
    // Determine the plan tier string based on the Razorpay Plan ID
    let planTier = "free";
    if (planId === process.env.RAZORPAY_STARTER_PLAN_ID) {
        planTier = "starter";
    } else if (planId === process.env.RAZORPAY_BUSINESS_PLAN_ID) {
        planTier = "business";
    }

    // Update the company in the database
    const updatedCompany = await prisma.company.update({
        where: { id: companyId },
        data: {
            plan: planTier, 
        }
    });

    return updatedCompany;
};