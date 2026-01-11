import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Clear existing data in order
  await prisma.program.deleteMany({});
  await prisma.university.deleteMany({});
  await prisma.employer.deleteMany({});

  // Create Universities
  const uog = await prisma.university.create({
    data: {
      name: "University of Ghana",
      shortName: "UG",
      email: "admissions@ug.edu.gh",
      phone: "+233302500381",
      city: "Legon",
      region: "Greater Accra",
      website: "https://www.ug.edu.gh",
      description:
        "The University of Ghana is the oldest and largest public university in Ghana, established in 1948.",
      logoUrl: "https://www.ug.edu.gh/sites/default/files/ug-logo.png",
      accreditationNumber: "NAB-UG-001",
      isVerified: true,
    },
  });

  const knust = await prisma.university.create({
    data: {
      name: "Kwame Nkrumah University of Science and Technology",
      shortName: "KNUST",
      email: "admissions@knust.edu.gh",
      phone: "+233322060331",
      city: "Kumasi",
      region: "Ashanti",
      website: "https://www.knust.edu.gh",
      description:
        "KNUST is the premier science and technology university in Ghana, known for engineering and applied sciences.",
      logoUrl: "https://www.knust.edu.gh/images/knust-logo.png",
      accreditationNumber: "NAB-KNUST-001",
      isVerified: true,
    },
  });

  const ucc = await prisma.university.create({
    data: {
      name: "University of Cape Coast",
      shortName: "UCC",
      email: "admissions@ucc.edu.gh",
      phone: "+233332133824",
      city: "Cape Coast",
      region: "Central",
      website: "https://www.ucc.edu.gh",
      description:
        "UCC is a leading public university in Ghana, known for education and liberal arts programs.",
      logoUrl: "https://www.ucc.edu.gh/images/ucc-logo.png",
      accreditationNumber: "NAB-UCC-001",
      isVerified: true,
    },
  });

  console.log("✅ Created universities:", uog.name, knust.name, ucc.name);

  // Create Employers
  const mtn = await prisma.employer.create({
    data: {
      name: "MTN Ghana",
      email: "careers@mtn.com.gh",
      phone: "+233244300000",
      city: "Accra",
      region: "Greater Accra",
      headquarters: "Airport City",
      industry: "Telecommunications",
      size: "500+",
      website: "https://www.mtn.com.gh",
      description:
        "MTN Ghana is the leading telecommunications company in Ghana, providing mobile services to millions.",
      logoUrl: "https://www.mtn.com.gh/images/mtn-logo.png",
      registrationNumber: "GH-MTN-001",
      isVerified: true,
    },
  });

  const calbank = await prisma.employer.create({
    data: {
      name: "CalBank PLC",
      email: "careers@calbank.net",
      phone: "+233302680061",
      city: "Accra",
      region: "Greater Accra",
      headquarters: "Independence Avenue",
      industry: "Finance",
      size: "500+",
      website: "https://www.calbank.net",
      description:
        "CalBank is a leading commercial bank in Ghana providing innovative financial solutions.",
      logoUrl: "https://www.calbank.net/images/calbank-logo.png",
      registrationNumber: "GH-CAL-001",
      isVerified: true,
    },
  });

  const tullow = await prisma.employer.create({
    data: {
      name: "Tullow Oil Ghana",
      email: "careers@tullowoil.com",
      phone: "+233302776833",
      city: "Accra",
      region: "Greater Accra",
      headquarters: "Ridge",
      industry: "Energy",
      size: "500+",
      website: "https://www.tullowoil.com",
      description:
        "Tullow Oil is a leading African-focused oil and gas exploration company operating in Ghana.",
      logoUrl: "https://www.tullowoil.com/images/tullow-logo.png",
      registrationNumber: "GH-TUL-001",
      isVerified: true,
    },
  });

  console.log("✅ Created employers:", mtn.name, calbank.name, tullow.name);

  // Create Programs (industry-sponsored training programs)
  const softwareProgram = await prisma.program.create({
    data: {
      title: "Software Developer Trainee",
      slug: "software-developer-mtn-2025",
      description:
        "A comprehensive 12-month program training junior software developers for MTN Ghana. Includes 6 months of classroom instruction and 6 months of hands-on internship at MTN offices. Covers web development, mobile apps, cloud computing, and agile methodologies.",
      shortDescription: "Become a software developer with MTN Ghana",
      field: "IT",
      specialization: "Software Development",
      jobRole: "Junior Software Developer",
      totalSlots: 10,
      availableSlots: 10,
      applicationFee: 100.0,
      applicationDeadline: new Date("2025-03-31"),
      startDate: new Date("2025-05-01"),
      endDate: new Date("2026-04-30"),
      durationWeeks: 52,
      minEducation: "Bachelor's Degree or HND",
      requiredGrades: {
        math: "C",
        english: "C",
      },
      additionalRequirements: [
        "Age between 18-30",
        "Computer Science or related field preferred",
      ],
      stipendAmount: 2000.0,
      hasInternship: true,
      internshipDuration: 26,
      tags: ["software", "development", "mtn", "IT"],
      status: "OPEN",
      isPublished: true,
      universityId: knust.id,
      employerId: mtn.id,
    },
  });

  const dataAnalystProgram = await prisma.program.create({
    data: {
      title: "Data Analyst Trainee",
      slug: "data-analyst-calbank-2025",
      description:
        "An 8-month intensive program focused on training data analysts for the banking sector. Learn SQL, Python, data visualization, financial modeling, and business intelligence tools. Co-op model with alternating classroom and practical work at CalBank.",
      shortDescription: "Become a data analyst with CalBank",
      field: "Business",
      specialization: "Data Analytics",
      jobRole: "Junior Data Analyst",
      totalSlots: 5,
      availableSlots: 5,
      applicationFee: 100.0,
      applicationDeadline: new Date("2025-04-15"),
      startDate: new Date("2025-06-01"),
      endDate: new Date("2026-01-31"),
      durationWeeks: 35,
      minEducation: "Bachelor's Degree",
      requiredGrades: {
        math: "B",
        english: "C",
      },
      additionalRequirements: [
        "Age between 18-28",
        "Statistics, Economics, or related field preferred",
      ],
      stipendAmount: 1800.0,
      hasInternship: true,
      internshipDuration: 16,
      tags: ["data", "analytics", "calbank", "finance"],
      status: "OPEN",
      isPublished: true,
      universityId: uog.id,
      employerId: calbank.id,
    },
  });

  const engineeringProgram = await prisma.program.create({
    data: {
      title: "Petroleum Engineering Trainee",
      slug: "petroleum-engineer-tullow-2025",
      description:
        "An 18-month rigorous program training petroleum engineers for Tullow Oil Ghana. Combines theoretical foundation with practical field experience in offshore and onshore operations. Focus on drilling, production, and reservoir engineering.",
      shortDescription: "Launch your career in oil & gas with Tullow",
      field: "Engineering",
      specialization: "Petroleum Engineering",
      jobRole: "Graduate Petroleum Engineer",
      totalSlots: 3,
      availableSlots: 3,
      applicationFee: 150.0,
      applicationDeadline: new Date("2025-05-31"),
      startDate: new Date("2025-08-01"),
      endDate: new Date("2027-01-31"),
      durationWeeks: 78,
      minEducation: "Bachelor's Degree in Engineering",
      requiredGrades: {
        math: "A",
        english: "B",
      },
      additionalRequirements: [
        "Age between 20-30",
        "Petroleum, Chemical, or Mechanical Engineering degree required",
      ],
      stipendAmount: 4000.0,
      hasInternship: true,
      internshipDuration: 36,
      tags: ["petroleum", "engineering", "tullow", "oil-gas"],
      status: "OPEN",
      isPublished: true,
      universityId: ucc.id,
      employerId: tullow.id,
    },
  });

  const cybersecurityProgram = await prisma.program.create({
    data: {
      title: "Cybersecurity Specialist Trainee",
      slug: "cybersecurity-specialist-mtn-2025",
      description:
        "A 10-month specialized program training cybersecurity professionals for MTN Ghana. Covers network security, ethical hacking, incident response, compliance, and security architecture. Hands-on labs and real-world scenarios.",
      shortDescription: "Become a cybersecurity expert with MTN Ghana",
      field: "IT",
      specialization: "Cybersecurity",
      jobRole: "Junior Security Analyst",
      totalSlots: 5,
      availableSlots: 5,
      applicationFee: 120.0,
      applicationDeadline: new Date("2025-04-30"),
      startDate: new Date("2025-06-15"),
      endDate: new Date("2026-04-15"),
      durationWeeks: 44,
      minEducation: "Bachelor's Degree or HND",
      requiredGrades: {
        math: "B",
        english: "C",
      },
      additionalRequirements: [
        "Age between 18-28",
        "Computer Science or related field preferred",
      ],
      stipendAmount: 2500.0,
      hasInternship: true,
      internshipDuration: 20,
      tags: ["cybersecurity", "security", "mtn", "IT"],
      status: "OPEN",
      isPublished: true,
      universityId: knust.id,
      employerId: mtn.id,
    },
  });

  console.log("✅ Created programs:");
  console.log("  -", softwareProgram.title, "(MTN + KNUST)");
  console.log("  -", dataAnalystProgram.title, "(CalBank + UG)");
  console.log("  -", engineeringProgram.title, "(Tullow + UCC)");
  console.log("  -", cybersecurityProgram.title, "(MTN + KNUST)");

  console.log("\n🎉 Seeding complete!");
  console.log("\nDatabase now contains:");
  console.log("  - 3 Universities");
  console.log("  - 3 Employers");
  console.log("  - 4 Training Programs");
}

main()
  .catch((e) => {
    console.error("❌ Seeding error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
