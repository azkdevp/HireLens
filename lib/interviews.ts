export function formatInterviewDate(value:string){return new Intl.DateTimeFormat("en-GB",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value))}
