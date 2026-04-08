export const formatPhoneNumber = (phone: string): string => {
    // Remove all non-numeric characters
    const digits = phone.replace(/\D/g, '');
    
    // Take the last 10 digits
    const last10 = digits.slice(-10);
    
    // Return with +91 prefix
    return `+91${last10}`;
};

export const isValidPhone = (phone: string): boolean => {
    const digits = phone.replace(/\D/g, '');
    return digits.length >= 10;
};
