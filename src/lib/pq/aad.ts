// Associated data binding each envelope to exactly one record.
export const gigAad = (gigId: string) => `gig:${gigId}`
export const phoneAad = (userId: string) => `phone:${userId}`
export const identityAad = (userId: string) => `identity:${userId}`
export const homeAddressAad = (userId: string) => `home-address:${userId}`
