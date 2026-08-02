export const PLAN_CONFIG = {
    free: {
        maxEmp: 3,
        canUseScreenshots: false,
        retentionDays: 7
    },
    starter: {
        maxEmp: 25,
        canUseScreenshots: true,
        retentionDays: 7
    },
    business: {
        maxEmp: 500, //unlimited for me
        canUseScreenshots: true,
        retentionDays: 7
    }
}
