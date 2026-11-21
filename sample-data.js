(function () {
  const podDefs = [
    ["pod-1", "North Star", "Priya Raman"],
    ["pod-2", "Juniper", "Arjun Nair"],
    ["pod-3", "Willow", "Meera Shah"],
    ["pod-4", "Cedar", "Kabir Das"],
    ["pod-5", "Sundial", "Isha Kapoor"],
    ["pod-6", "Harbor", "Rohan Menon"],
  ];
  const names = [
    "Aarav Mehta", "Anaya Iyer", "Dev Malhotra", "Diya Khanna", "Ishaan Bose", "Kavya Rao",
    "Neil Sethi", "Myra Joshi", "Reyansh Kulkarni", "Aisha Menon", "Ritvik Sen", "Sara Dutta",
    "Advik Nair", "Tara Bhat", "Vivaan Ghosh", "Naina Kapoor", "Kabir Sood", "Rhea Thomas",
    "Saanvi Desai", "Arjun Pillai", "Mira Chawla", "Veer Anand", "Kiara Roy", "Ayaan George",
    "Ira Mukherjee", "Om Prakash", "Zoya Fernandes", "Dhruv Jain", "Navya Reddy", "Samir Khan",
  ];
  const pods = podDefs.map(([id, name, lead]) => ({ id, name, lead }));
  const employees = names.map((name, index) => ({
    id: `e${String(index + 1).padStart(2, "0")}`,
    name,
    podId: podDefs[index % podDefs.length][0],
    weeklyOff: [19, 22, 25, 28].includes(index) ? 2 : 0,
    title: index < 18 ? "Operations associate" : "CX specialist",
  }));
  const singleBrandNames = [
    "Aster & Ash", "Morrow Goods", "Fieldnotes Studio", "Sunday Supply", "Little Fern Co.", "Ritual Objects",
    "Lumen Living", "Nook & Nest", "Thread Theory", "Goodland Market", "Kindred Kitchen", "Brass & Bloom",
    "Paper Cove", "Slow Sunday", "Cloudnine Baby", "Fable Skincare", "Soma Active", "Petal & Paw",
  ];
  const multiBrandNames = ["Orbit & Oak", "Northline Wear", "Mysa Home", "Everwell Naturals"];
  const singleProcesses = [
    ["Customer Support", "CS"],
    ["Abandoned Cart", "ACC"],
    ["Non-Delivery Reports", "NDR"],
  ];
  const mondayToSaturday = [1, 2, 3, 4, 5, 6];
  const allDays = [0, 1, 2, 3, 4, 5, 6];
  const brands = [];
  const processes = [];
  const assignments = [];

  function addBrand(id, name, employeeIds, shared = false) {
    brands.push({ id, name, segment: shared ? "Growth" : "Direct to consumer" });
    if (!shared) {
      for (const [suffix, [processName, code]] of singleProcesses.entries()) {
        const processId = `${id}-${code.toLowerCase()}`;
        processes.push({
          id: processId,
          brandId: id,
          name: processName,
          operatingDays: mondayToSaturday,
          holidayMode: "off",
          minStaff: 1,
        });
        assignments.push({ id: `a-${id}-${suffix}`, brandId: id, processId, employeeId: employeeIds[0] });
      }
      return;
    }
    const [primary, flex, retention] = employeeIds;
    const definitions = [
      { id: `${id}-cs`, name: "Customer Support", operatingDays: allDays, holidayMode: "operate", people: [primary, flex] },
      { id: `${id}-acc`, name: "Abandoned Cart", operatingDays: mondayToSaturday, holidayMode: "off", people: [primary, retention] },
      { id: `${id}-ndr`, name: "Non-Delivery Reports", operatingDays: mondayToSaturday, holidayMode: "off", people: [retention] },
    ];
    for (const [index, definition] of definitions.entries()) {
      processes.push({
        id: definition.id,
        brandId: id,
        name: definition.name,
        operatingDays: definition.operatingDays,
        holidayMode: definition.holidayMode,
        minStaff: 1,
        dayMinimums: definition.id === "brand-19-cs" ? { "6": 2 } : {},
      });
      for (const [personIndex, employeeId] of definition.people.entries()) {
        assignments.push({ id: `a-${id}-${index}-${personIndex}`, brandId: id, processId: definition.id, employeeId });
      }
    }
  }

  for (const [index, name] of singleBrandNames.entries()) {
    addBrand(`brand-${String(index + 1).padStart(2, "0")}`, name, [`e${String(index + 1).padStart(2, "0")}`]);
  }
  for (const [index, name] of multiBrandNames.entries()) {
    const first = 19 + index * 3;
    addBrand(`brand-${String(19 + index).padStart(2, "0")}`, name, [first, first + 1, first + 2].map((number) => `e${String(number).padStart(2, "0")}`), true);
  }

  window.SAMPLE_DATA = {
    schemaVersion: 1,
    pods,
    employees,
    brands,
    processes,
    assignments,
    holidays: [
      { date: "2026-11-08", name: "Festival day" },
      { date: "2026-11-24", name: "Regional holiday" },
      { date: "2027-01-26", name: "Republic Day" },
      { date: "2027-08-15", name: "Independence Day" },
      { date: "2027-10-02", name: "Gandhi Jayanti" },
    ],
    leaves: [],
    roster: { month: "", generatedAt: "", plan: {} },
    changeLog: [],
    scenario: null,
  };
})();
